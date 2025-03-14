package main

import "github.com/wailsapp/wails/v2/pkg/runtime"

import (
	"context"
	"fmt"
)

// App struct
type App struct {
	ctx context.Context
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}

// ScanProject scans a React project directory and returns visualization data
func (a *App) ScanProject(dir string) (string, error) {
	return GetProjectJSON(dir)
}

// SelectDirectory opens a directory selection dialog
// SelectDirectory opens a directory selection dialog
func (a *App) SelectDirectory() (string, error) {
	// Use the Wails dialog API to open a directory selection dialog
	selectedDirectory, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select React Project Directory",
	})
	if err != nil {
		return "", fmt.Errorf("failed to open directory dialog: %w", err)
	}

	// If user cancels the dialog, an empty string is returned with no error
	if selectedDirectory == "" {
		return "", nil
	}

	return selectedDirectory, nil
}
