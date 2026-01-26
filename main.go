package main

import (
	"embed"
	"fmt"
	"io/fs"
	"log"
	"net/http"
)

//go:embed static/*
var staticFiles embed.FS

func main() {
	// Serve static files from embedded filesystem
	staticFS, err := fs.Sub(staticFiles, "static")
	if err != nil {
		log.Fatal(err)
	}

	http.Handle("/", http.FileServer(http.FS(staticFS)))

	port := "8080"
	fmt.Printf("🧮 Chronomaths démarre sur http://localhost:%s\n", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}
