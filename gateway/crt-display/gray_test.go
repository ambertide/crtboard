package main

import (
	"image"
	"image/color"
	"testing"
)

// The fast RGBA paths must give the same luminance as the generic one.
func TestToGrayFastPathMatchesGeneric(t *testing.T) {
	rect := image.Rect(0, 0, 7, 5)
	nrgba := image.NewNRGBA(rect)
	rgba := image.NewRGBA(rect)
	for y := 0; y < rect.Dy(); y++ {
		for x := 0; x < rect.Dx(); x++ {
			c := color.NRGBA{uint8(x * 37), uint8(y * 51), uint8(x*y*13 + 5), 255}
			nrgba.SetNRGBA(x, y, c)
			rgba.Set(x, y, c)
		}
	}
	// Wrapping hides the concrete type so toGray takes the generic path.
	type opaque struct{ image.Image }
	want := toGray(opaque{nrgba})

	for name, img := range map[string]image.Image{"NRGBA": nrgba, "RGBA": rgba} {
		got := toGray(img)
		for i := range want.Pix {
			if got.Pix[i] != want.Pix[i] {
				t.Fatalf("%s: pixel %d is %d, want %d", name, i, got.Pix[i], want.Pix[i])
			}
		}
	}
}
