// crt-display draws a monochrome CRT test pattern on the Raspberry Pi's
// framebuffer, which feeds the analog (composite) output.
//
// It runs as a systemd service on boot. The console on the display's VT is
// switched to graphics mode so the kernel stops drawing text and the cursor
// over the picture, and is switched back to text mode on exit.
package main

import (
	"flag"
	"fmt"
	"image"
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
	flag.Parse()

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

	// Log only changes, so a missing display does not flood the journal.
	lastLog := "unset"
	draw := func() {
		msg := fmt.Sprintf("showing %s on %s", *imagePath, *fbPath)
		if err := drawToFramebuffer(*fbPath, pattern); err != nil {
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
	b := src.Bounds()
	gray := image.NewGray(image.Rect(0, 0, b.Dx(), b.Dy()))
	for y := 0; y < b.Dy(); y++ {
		for x := 0; x < b.Dx(); x++ {
			r, g, bl, _ := src.At(b.Min.X+x, b.Min.Y+y).RGBA()
			// ITU-R BT.601 luma, as an analog TV would see it.
			gray.Pix[y*gray.Stride+x] = uint8((299*r + 587*g + 114*bl) / 1000 >> 8)
		}
	}
	return gray, nil
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

// drawToFramebuffer stretches the pattern over the whole screen and writes it
// in the framebuffer's pixel format. Analog TV pixels are not square: a
// 720x576 PAL or 720x480 NTSC frame already fills a 4:3 screen, so keeping
// the image's pixel aspect would leave black bars.
func drawToFramebuffer(fbPath string, pattern *image.Gray) error {
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

	pw, ph := pattern.Rect.Dx(), pattern.Rect.Dy()
	buf := make([]byte, s.stride*s.height)
	for y := 0; y < s.height; y++ {
		sy := y * ph / s.height
		row := buf[y*s.stride:]
		for x := 0; x < s.width; x++ {
			sx := x * pw / s.width
			putGray(row[x*bytesPerPixel:], bytesPerPixel, pattern.Pix[sy*pattern.Stride+sx])
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
