package main

// Images arrive over a serial line (the USB gadget's /dev/ttyGS0) with a small
// line-based protocol. Every reply is one line.
//
//	PING            -> PONG crt-display
//	IMG <bytes>     -> READY, then the host sends exactly <bytes> bytes of a
//	                   PNG, JPEG or GIF file -> OK <width>x<height>
//	FRAME <bytes>   -> same as IMG, but the image is a frame of a live stream
//	                   and is not saved to disk
//
// Any failure is answered with ERR <reason>.

import (
	"bufio"
	"bytes"
	"errors"
	"fmt"
	"image"
	"io"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

const (
	maxUploadBytes  = 16 << 20
	maxUploadPixels = 40_000_000
	bodyTimeout     = 30 * time.Second
	// A stream frame arrives in milliseconds; one cut off by a closed or
	// reloaded browser tab must not hold up the next connection for long.
	frameTimeout = 3 * time.Second
)

type upload struct {
	image *image.Gray
	path  string
}

// receiveUploads serves the serial device forever, reopening it whenever it
// fails, and sends each received image on uploads.
func receiveUploads(path, dir string, uploads chan<- upload) {
	lastLog := ""
	for {
		err := serveSerial(path, dir, uploads)
		if msg := fmt.Sprintf("serial %s: %v", path, err); msg != lastLog {
			log.Print(msg)
			lastLog = msg
		}
		time.Sleep(2 * time.Second)
	}
}

func serveSerial(path, dir string, uploads chan<- upload) error {
	port, err := os.OpenFile(path, os.O_RDWR|syscall.O_NOCTTY, 0)
	if err != nil {
		return err
	}
	defer port.Close()
	if err := makeRaw(port); err != nil {
		return err
	}
	log.Printf("listening for images on %s", path)

	r := bufio.NewReader(port)
	reply := func(format string, args ...any) error {
		_, err := fmt.Fprintf(port, format+"\n", args...)
		return err
	}
	for {
		line, err := r.ReadString('\n')
		if err != nil {
			return err
		}
		cmd, arg, _ := strings.Cut(strings.TrimSpace(line), " ")
		switch cmd {
		case "":
			continue
		case "PING":
			err = reply("PONG crt-display")
		case "IMG", "FRAME":
			var u upload
			if u, err = receiveImage(port, r, arg, dir, cmd == "IMG", reply); err != nil {
				err = reply("ERR %v", err)
			} else {
				uploads <- u
				err = reply("OK %dx%d", u.image.Rect.Dx(), u.image.Rect.Dy())
			}
		default:
			err = reply("ERR unknown command %q", cmd)
		}
		if err != nil {
			return err
		}
	}
}

// receiveImage reads one image body. Uploads are kept in dir; stream frames
// (keep false) arrive many times a second and are only held in memory.
func receiveImage(port *os.File, r *bufio.Reader, arg, dir string, keep bool, reply func(string, ...any) error) (upload, error) {
	size, err := strconv.Atoi(arg)
	if err != nil || size <= 0 {
		return upload{}, fmt.Errorf("bad size %q", arg)
	}
	if size > maxUploadBytes {
		return upload{}, fmt.Errorf("image is %d bytes, limit is %d", size, maxUploadBytes)
	}
	if err := reply("READY"); err != nil {
		return upload{}, err
	}

	// A host that stops mid-transfer must not leave the reader waiting forever.
	// Deadlines are best effort; the port may not support them.
	timeout := bodyTimeout
	if !keep {
		timeout = frameTimeout
	}
	port.SetReadDeadline(time.Now().Add(timeout))
	data := make([]byte, size)
	_, err = io.ReadFull(r, data)
	port.SetReadDeadline(time.Time{})
	if err != nil {
		if errors.Is(err, os.ErrDeadlineExceeded) {
			return upload{}, errors.New("timed out waiting for image data")
		}
		return upload{}, err
	}

	cfg, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return upload{}, fmt.Errorf("not a PNG, JPEG or GIF: %v", err)
	}
	if cfg.Width*cfg.Height > maxUploadPixels {
		return upload{}, fmt.Errorf("image is %dx%d, too large", cfg.Width, cfg.Height)
	}
	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return upload{}, fmt.Errorf("decode: %v", err)
	}
	if !keep {
		return upload{image: toGray(img), path: "the serial stream"}, nil
	}

	// Keep only the latest upload; dir is under /tmp so it goes on reboot.
	if err := os.RemoveAll(dir); err != nil {
		return upload{}, err
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return upload{}, err
	}
	path := filepath.Join(dir, "upload."+format)
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return upload{}, err
	}
	return upload{image: toGray(img), path: path}, nil
}

// makeRaw turns off the tty line discipline so binary data passes through
// unchanged and nothing is echoed back.
func makeRaw(f *os.File) error {
	var t syscall.Termios
	if err := ioctl(f.Fd(), syscall.TCGETS, uintptr(unsafe.Pointer(&t))); err != nil {
		return fmt.Errorf("read tty settings: %w", err)
	}
	t.Iflag &^= syscall.IGNBRK | syscall.BRKINT | syscall.PARMRK | syscall.ISTRIP |
		syscall.INLCR | syscall.IGNCR | syscall.ICRNL | syscall.IXON
	t.Oflag &^= syscall.OPOST
	t.Lflag &^= syscall.ECHO | syscall.ECHONL | syscall.ICANON | syscall.ISIG | syscall.IEXTEN
	t.Cflag &^= syscall.CSIZE | syscall.PARENB
	t.Cflag |= syscall.CS8
	t.Cc[syscall.VMIN] = 1
	t.Cc[syscall.VTIME] = 0
	if err := ioctl(f.Fd(), syscall.TCSETS, uintptr(unsafe.Pointer(&t))); err != nil {
		return fmt.Errorf("set tty raw: %w", err)
	}
	return nil
}
