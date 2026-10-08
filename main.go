package main

import (
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app := NewApp("model.onnx", "onnxruntime.dll")

	err := wails.Run(&options.App{
		Title:            "UVR Glass Player",
		Width:            1024,
		Height:           768,
		MinWidth:         800,
		MinHeight:        600,
		Frameless:        true,
		BackgroundColour: &options.RGBA{R: 10, G: 10, B: 15, A: 220},
		DisableResize:    false,
		AssetServer:      &assetserver.Options{Assets: assets},
		OnStartup:        app.startup,
		Bind:             []interface{}{app},
		Windows: &windows.Options{
			WebviewIsTransparent: true,
			WindowIsTranslucent:  true,
			BackdropType:         windows.Mica,
			DisableWindowIcon:    true,
		},
	})
	if err != nil {
		panic(err)
	}
}
