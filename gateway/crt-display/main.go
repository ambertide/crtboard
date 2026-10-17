// crt-display draws a monochrome CRT test pattern on the Raspberry Pi's
// framebuffer, which feeds the analog (composite) output.
//
// It runs as a systemd service on boot. The console on the display's VT is
// switched to graphics mode so the kernel stops drawing text and the cursor
// over the picture, and is switched back to text mode on exit.
//
// With -serial it also accepts images over the USB serial gadget and shows
// the latest one instead of the test pattern.
package main

import (
	"flag"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"log"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

const (
	fbiogetVScreenInfo = 0x4600 // FBIOGET_VSCREENINFO
	kdSetMode          = 0x4B3A // KDSETMODE
	kdText             = 0x00
	kdGraphics         = 0x01
)

func main() {
	imagePath := flag.String("image", "/usr/local/share/crt-display/test.png", "test pattern to display")
	fbPath := flag.String("fb", "/dev/fb0", "framebuffer device")
	ttyPath := flag.String("tty", "/dev/tty1", "console VT to switch to graphics mode, empty to skip")
	redraw := flag.Duration("redraw", 10*time.Second, "how often to redraw the pattern, 0 to draw once")
	force := flag.Bool("force", false, "allow running from an SSH session")
	serialPath := flag.String("serial", "", "serial device to receive images on, empty to disable")
	uploadDir := flag.String("upload-dir", "/tmp/crt-display", "where received images are stored")
	overscanFlag := flag.String("overscan", "0,0,0,0", "left,top,right,bottom margins in screen pixels hidden by the CRT bezel")
	flag.Parse()

	overscan, err := parseOverscan(*overscanFlag)
	if err != nil {
		log.Fatal(err)
	}

	// Drawing from an SSH login takes the display away from the service.
	if !*force && (os.Getenv("SSH_CONNECTION") != "" || os.Getenv("SSH_TTY") != "") {
		log.Fatal("refusing to run from an SSH session; use `sudo systemctl restart crt-display` or pass -force")
	}

	pattern, err := loadGray(*imagePath)
	if err != nil {
		log.Fatal(err)
	}

	if *ttyPath != "" {
		restore, err := graphicsMode(*ttyPath)
		if err != nil {
			log.Printf("could not switch %s to graphics mode: %v", *ttyPath, err)
		} else {
			defer restore()
		}
	}

	uploads := make(chan upload)
	if *serialPath != "" {
		go receiveUploads(*serialPath, *uploadDir, uploads)
	}

	// Log only changes, so a missing display does not flood the journal.
	source := *imagePath
	lastLog := "unset"
	draw := func() {
		msg := fmt.Sprintf("showing %s on %s", source, *fbPath)
		if err := drawToFramebuffer(*fbPath, pattern, overscan); err != nil {
			msg = err.Error()
		}
		if msg != lastLog {
			log.Print(msg)
			lastLog = msg
		}
	}
	draw()

	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGTERM, syscall.SIGINT, syscall.SIGHUP)

	// Redrawing recovers the picture if anything else wrote to the framebuffer.
	var tick <-chan time.Time
	if *redraw > 0 {
		ticker := time.NewTicker(*redraw)
		defer ticker.Stop()
		tick = ticker.C
	}
	for {
		select {
		case <-tick:
			draw()
		case u := <-uploads:
			pattern, source = u.image, u.path
			draw()
		case sig := <-signals:
			if sig == syscall.SIGHUP {
				draw()
				continue
			}
			return
		}
	}
}

// loadGray decodes an image into 8-bit luminance, so the output is
// monochrome whatever the source.
func loadGray(path string) (*image.Gray, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	src, _, err := image.Decode(f)
	if err != nil {
		return nil, fmt.Errorf("decode %s: %w", path, err)
	}
	return toGray(src), nil
}

// toGray converts an image to 8-bit luminance.
func toGray(src image.Image) *image.Gray {
	b := src.Bounds()
	gray := image.NewGray(image.Rect(0, 0, b.Dx(), b.Dy()))

	// Browser canvases encode to RGBA PNGs; reading their pixels directly is
	// fast enough for a live stream, unlike the generic At() path below.
	var pix []byte
	var stride int
	switch img := src.(type) {
	case *image.NRGBA:
		pix, stride = img.Pix[img.PixOffset(b.Min.X, b.Min.Y):], img.Stride
	case *image.RGBA:
		pix, stride = img.Pix[img.PixOffset(b.Min.X, b.Min.Y):], img.Stride
	}
	if pix != nil {
		for y := 0; y < b.Dy(); y++ {
			row := pix[y*stride:]
			out := gray.Pix[y*gray.Stride:]
			for x := 0; x < b.Dx(); x++ {
				// Widen to 16 bits as RGBA() does, so both paths round alike.
				r, g, bl := uint32(row[x*4])*0x101, uint32(row[x*4+1])*0x101, uint32(row[x*4+2])*0x101
				out[x] = uint8((299*r + 587*g + 114*bl) / 1000 >> 8)
			}
		}
		return gray
	}

	for y := 0; y < b.Dy(); y++ {
		for x := 0; x < b.Dx(); x++ {
			r, g, bl, _ := src.At(b.Min.X+x, b.Min.Y+y).RGBA()
			// ITU-R BT.601 luma, as an analog TV would see it.
			gray.Pix[y*gray.Stride+x] = uint8((299*r + 587*g + 114*bl) / 1000 >> 8)
		}
	}
	return gray
}

// graphicsMode stops the kernel console drawing on the VT and returns a
// function that switches it back to text.
func graphicsMode(path string) (func(), error) {
	tty, err := os.OpenFile(path, os.O_RDWR, 0)
	if err != nil {
		return nil, err
	}
	if err := ioctl(tty.Fd(), kdSetMode, kdGraphics); err != nil {
		tty.Close()
		return nil, err
	}
	return func() {
		ioctl(tty.Fd(), kdSetMode, kdText)
		tty.Close()
	}, nil
}

type screen struct {
	width, height, bitsPerPixel, stride int
}

func readScreen(fb *os.File, fbPath string) (screen, error) {
	// struct fb_var_screeninfo starts with xres, yres, xres_virtual,
	// yres_virtual, xoffset, yoffset, bits_per_pixel, all __u32.
	var info [40]uint32
	if err := ioctl(fb.Fd(), fbiogetVScreenInfo, uintptr(unsafe.Pointer(&info[0]))); err != nil {
		return screen{}, fmt.Errorf("read %s screen info: %w", fbPath, err)
	}
	s := screen{width: int(info[0]), height: int(info[1]), bitsPerPixel: int(info[6])}

	// The line length can include padding, so read it rather than derive it.
	name := fbPath[strings.LastIndex(fbPath, "/")+1:]
	raw, err := os.ReadFile("/sys/class/graphics/" + name + "/stride")
	if err == nil {
		s.stride, err = strconv.Atoi(strings.TrimSpace(string(raw)))
	}
	if err != nil || s.stride == 0 {
		s.stride = s.width * s.bitsPerPixel / 8
	}
	return s, nil
}

// margins is how many screen pixels the CRT hides on each side.
type margins struct {
	left, top, right, bottom int
}

// parseOverscan reads margins written as "left,top,right,bottom".
func parseOverscan(v string) (margins, error) {
	parts := strings.Split(v, ",")
	if len(parts) != 4 {
		return margins{}, fmt.Errorf("overscan %q: want left,top,right,bottom", v)
	}
	var n [4]int
	for i, p := range parts {
		var err error
		if n[i], err = strconv.Atoi(strings.TrimSpace(p)); err != nil || n[i] < 0 {
			return margins{}, fmt.Errorf("overscan %q: %q is not a pixel count", v, p)
		}
	}
	return margins{n[0], n[1], n[2], n[3]}, nil
}

// drawToFramebuffer stretches the pattern over the part of the screen the CRT
// shows, leaves the overscan margins black, and writes it in the framebuffer's
// pixel format. Analog TV pixels are not square: a 720x576 PAL or 720x480 NTSC
// frame already fills a 4:3 screen, so keeping the image's pixel aspect would
// leave black bars.
func drawToFramebuffer(fbPath string, pattern *image.Gray, m margins) error {
	fb, err := os.OpenFile(fbPath, os.O_RDWR, 0)
	if err != nil {
		return err
	}
	defer fb.Close()

	s, err := readScreen(fb, fbPath)
	if err != nil {
		return err
	}
	bytesPerPixel := s.bitsPerPixel / 8
	if bytesPerPixel < 2 || bytesPerPixel > 4 {
		return fmt.Errorf("%s: unsupported %d bits per pixel", fbPath, s.bitsPerPixel)
	}

	w, h := s.width-m.left-m.right, s.height-m.top-m.bottom
	if w <= 0 || h <= 0 {
		return fmt.Errorf("overscan %+v leaves nothing of the %dx%d screen", m, s.width, s.height)
	}

	pw, ph := pattern.Rect.Dx(), pattern.Rect.Dy()
	buf := make([]byte, s.stride*s.height)
	for y := 0; y < h; y++ {
		sy := y * ph / h
		row := buf[(m.top+y)*s.stride:]
		for x := 0; x < w; x++ {
			sx := x * pw / w
			putGray(row[(m.left+x)*bytesPerPixel:], bytesPerPixel, pattern.Pix[sy*pattern.Stride+sx])
		}
	}

	_, err = fb.WriteAt(buf, 0)
	return err
}

// putGray writes one grey pixel. Every channel holds the same value, so the
// channel order of the framebuffer does not matter.
func putGray(px []byte, bytesPerPixel int, v uint8) {
	switch bytesPerPixel {
	case 2: // RGB565
		p := uint16(v>>3)<<11 | uint16(v>>2)<<5 | uint16(v>>3)
		px[0], px[1] = byte(p), byte(p>>8)
	case 3:
		px[0], px[1], px[2] = v, v, v
	case 4:
		px[0], px[1], px[2], px[3] = v, v, v, 0xff
	}
}

func ioctl(fd, request, arg uintptr) error {
	if _, _, errno := syscall.Syscall(syscall.SYS_IOCTL, fd, request, arg); errno != 0 {
		return errno
	}
	return nil
}
