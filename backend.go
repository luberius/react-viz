package main

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// ComponentNode represents a component in the React project
type ComponentNode struct {
	ID           string          `json:"id"`
	Name         string          `json:"name"`
	Path         string          `json:"path"`
	Type         string          `json:"type"` // component, state, util
	MultipleComp bool            `json:"multipleComp"`
	Imports      []string        `json:"imports"`
	ImportedBy   []string        `json:"importedBy"`
	Children     []ComponentNode `json:"children,omitempty"`
}

// Project represents the entire React project structure
type Project struct {
	Root     ComponentNode            `json:"root"`
	NodesMap map[string]ComponentNode `json:"nodesMap"`
	Files    []string                 `json:"files"`
	Stats    ProjectStats             `json:"stats"`
}

// ProjectStats contains statistics about the project
type ProjectStats struct {
	TotalComponents int `json:"totalComponents"`
	MultiCompFiles  int `json:"multiCompFiles"`
	ComponentFiles  int `json:"componentFiles"`
	StateFiles      int `json:"stateFiles"`
	UtilFiles       int `json:"utilFiles"`
}

// ScanProject scans a React project directory and returns a Project structure
func ScanProject(rootDir string) (Project, error) {
	// Read project configuration for import aliases
	aliasConfig, err := ReadProjectConfig(rootDir)
	if err != nil {
		log.Printf("Warning: Could not read project config: %v, using defaults", err)
	}

	project := Project{
		Root: ComponentNode{
			ID:   "root",
			Name: filepath.Base(rootDir),
			Path: rootDir,
			Type: "root",
		},
		NodesMap: make(map[string]ComponentNode),
		Files:    []string{},
	}

	// Walk through the project directory
	err = filepath.Walk(rootDir, func(path string, info fs.FileInfo, err error) error {
		if err != nil {
			return err
		}

		// Skip node_modules, build directories, and hidden files
		if info.IsDir() && (info.Name() == "node_modules" || info.Name() == "build" ||
			info.Name() == "dist" || strings.HasPrefix(info.Name(), ".")) {
			return filepath.SkipDir
		}

		// Process only JS/TS/JSX/TSX files
		if !info.IsDir() && isReactFile(info.Name()) {
			relPath, _ := filepath.Rel(rootDir, path)
			project.Files = append(project.Files, relPath)

			// Parse the file to extract components and dependencies
			node, err := parseFile(path, relPath, rootDir, aliasConfig)
			if err != nil {
				return err
			}

			if node.Name != "" {
				project.NodesMap[node.ID] = node

				// Update stats
				project.Stats.TotalComponents++
				if node.Type == "component" {
					project.Stats.ComponentFiles++
					if node.MultipleComp {
						project.Stats.MultiCompFiles++
					}
				} else if node.Type == "state" {
					project.Stats.StateFiles++
				} else if node.Type == "util" {
					project.Stats.UtilFiles++
				}
			}
		}

		return nil
	})
	if err != nil {
		return project, err
	}

	// Build relationships between components
	buildRelationships(&project)

	// Build the tree structure
	buildTree(&project)

	return project, nil
}

// isReactFile checks if a file is a React-related file
func isReactFile(filename string) bool {
	ext := strings.ToLower(filepath.Ext(filename))
	return ext == ".js" || ext == ".jsx" || ext == ".ts" || ext == ".tsx"
}

// parseFile extracts component information from a file
func parseFile(path, relPath string, rootDir string, aliasConfig AliasConfig) (ComponentNode, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return ComponentNode{}, err
	}

	fileContent := string(content)
	fileName := filepath.Base(path)
	fileNameWithoutExt := strings.TrimSuffix(fileName, filepath.Ext(fileName))

	componentName := fileNameWithoutExt

	// If this is an index file, use parent directory name as component name
	if fileNameWithoutExt == "index" {
		parentDir := filepath.Dir(relPath)
		// If relPath is directly "index.js", use the project name
		if parentDir == "." {
			parentDir = filepath.Base(rootDir)
		} else {
			// Otherwise use the directory name
			componentName = filepath.Base(parentDir) + "/index"
		}
	}

	node := ComponentNode{
		ID:         relPath,
		Name:       componentName,
		Path:       relPath,
		Imports:    []string{},
		ImportedBy: []string{},
	}

	// Determine file type
	if isComponentFile(fileContent, fileName) {
		node.Type = "component"
		node.MultipleComp = hasMultipleComponents(fileContent)
	} else if isStateFile(fileContent, relPath) {
		node.Type = "state"
	} else {
		node.Type = "util"
	}

	// Extract imports
	node.Imports = extractImports(fileContent, filepath.Dir(relPath), rootDir, aliasConfig)

	return node, nil
}

// isComponentFile determines if a file contains React components
func isComponentFile(content, fileName string) bool {
	// Check for React import
	hasReactImport := strings.Contains(content, "import React") || strings.Contains(content, "from 'react'") || strings.Contains(content, "from \"react\"")

	// Check for component patterns
	hasJSXReturn := strings.Contains(content, "return (") && (strings.Contains(content, "<") && strings.Contains(content, "/>"))
	hasComponentDef := regexp.MustCompile(`(function|const|class)\s+\w+\s*[({]`).MatchString(content) &&
		strings.Contains(content, "render") || strings.Contains(content, "return")

	// If filename starts with uppercase, it's likely a component
	startsWithUppercase := len(fileName) > 0 && fileName[0] >= 'A' && fileName[0] <= 'Z'

	return (hasReactImport && (hasJSXReturn || hasComponentDef)) || startsWithUppercase
}

// hasMultipleComponents checks if a file contains multiple component definitions
func hasMultipleComponents(content string) bool {
	// Look for multiple component patterns
	componentDefs := regexp.MustCompile(`(function|const|class)\s+[A-Z]\w+\s*[({]`).FindAllString(content, -1)
	return len(componentDefs) > 1
}

// isStateFile determines if a file is related to state management
func isStateFile(content, path string) bool {
	// Check for Redux patterns
	isRedux := strings.Contains(content, "createStore") ||
		strings.Contains(content, "combineReducers") ||
		strings.Contains(content, "createSlice") ||
		strings.Contains(path, "redux") ||
		strings.Contains(path, "store") ||
		strings.Contains(path, "state") ||
		strings.Contains(path, "reducer") ||
		strings.Contains(path, "action")

	// Check for other state management libraries
	isOtherState := strings.Contains(content, "useContext") ||
		strings.Contains(content, "createContext") ||
		strings.Contains(content, "Provider") ||
		strings.Contains(content, "zustand") ||
		strings.Contains(content, "recoil") ||
		strings.Contains(content, "jotai") ||
		strings.Contains(content, "mobx")

	return isRedux || isOtherState
}

// extractImports extracts import statements from file content
func extractImports(content, dir string, rootDir string, aliasConfig AliasConfig) []string {
	imports := []string{}

	// Find all import statements
	importRegex := regexp.MustCompile(`import\s+(?:{[^}]*}|\w+)\s+from\s+['"]([^'"]+)['"]`)
	matches := importRegex.FindAllStringSubmatch(content, -1)

	for _, match := range matches {
		if len(match) > 1 {
			importPath := match[1]

			// Skip obvious node_modules imports (packages with @ or no path separators)
			if strings.HasPrefix(importPath, "@") || !strings.Contains(importPath, "/") {
				// But make an exception for path aliases that might be single words
				isAlias := false
				for alias := range aliasConfig.Aliases {
					if importPath == alias || strings.HasPrefix(importPath, alias+"/") {
						isAlias = true
						break
					}
				}

				if !isAlias && !strings.HasPrefix(importPath, ".") && !strings.HasPrefix(importPath, "/") {
					continue // Skip this import as it's likely an external module
				}
			}

			// Resolve the import path using our alias configuration
			resolvedPath := ResolveImportPath(importPath, aliasConfig, rootDir, dir)

			// Make path relative to project root
			relPath, err := filepath.Rel(rootDir, resolvedPath)
			if err == nil {
				resolvedPath = relPath
			}

			// Add extensions if missing
			if !strings.Contains(filepath.Base(resolvedPath), ".") {
				possibleExts := []string{".js", ".jsx", ".ts", ".tsx"}
				foundExt := false

				for _, ext := range possibleExts {
					fullPath := filepath.Join(rootDir, resolvedPath+ext)
					if _, err := os.Stat(fullPath); err == nil {
						resolvedPath = resolvedPath + ext
						foundExt = true
						break
					}
				}

				// Also try with /index.* extensions
				if !foundExt {
					for _, ext := range possibleExts {
						fullPath := filepath.Join(rootDir, resolvedPath, "index"+ext)
						if _, err := os.Stat(fullPath); err == nil {
							resolvedPath = filepath.Join(resolvedPath, "index"+ext)
							break
						}
					}
				}
			}

			imports = append(imports, resolvedPath)
		}
	}

	return imports
}

// buildRelationships establishes connections between components
func buildRelationships(project *Project) {
	// Initialize ImportedBy arrays
	for id, node := range project.NodesMap {
		for _, importPath := range node.Imports {
			if importedNode, exists := project.NodesMap[importPath]; exists {
				importedNode.ImportedBy = append(importedNode.ImportedBy, id)
				project.NodesMap[importPath] = importedNode
			}
		}
	}
}

// buildTree constructs a hierarchical tree based on directory structure
func buildTree(project *Project) {
	// Group nodes by directory
	dirNodes := make(map[string][]ComponentNode)

	for _, node := range project.NodesMap {
		dir := filepath.Dir(node.Path)
		dirNodes[dir] = append(dirNodes[dir], node)
	}

	// Build tree recursively
	buildTreeRecursive(&project.Root, "", dirNodes)
}

// buildTreeRecursive is a helper function for buildTree
func buildTreeRecursive(parent *ComponentNode, dir string, dirNodes map[string][]ComponentNode) {
	nodes, exists := dirNodes[dir]
	if exists {
		for _, node := range nodes {
			parent.Children = append(parent.Children, node)
		}
	}

	// Process subdirectories
	for nodeDir := range dirNodes {
		if nodeDir != dir && strings.HasPrefix(nodeDir, dir) {
			// Check if it's a direct subdirectory
			relDir := strings.TrimPrefix(nodeDir, dir)
			if relDir != "" && !strings.Contains(strings.TrimPrefix(relDir, "/"), "/") {
				// Create a directory node
				subdirNode := ComponentNode{
					ID:       nodeDir,
					Name:     filepath.Base(nodeDir),
					Path:     nodeDir,
					Type:     "directory",
					Children: []ComponentNode{},
				}

				buildTreeRecursive(&subdirNode, nodeDir, dirNodes)
				parent.Children = append(parent.Children, subdirNode)
			}
		}
	}
}

func ConvertToUnixPath(path string) string {
	return strings.ReplaceAll(path, "\\", "/")
}

func ConvertProjectPathsToUnix(project *Project) {
	// Convert root paths
	project.Root.Path = ConvertToUnixPath(project.Root.Path)

	// Convert all files paths
	for i, filePath := range project.Files {
		project.Files[i] = ConvertToUnixPath(filePath)
	}

	// Create a new map with converted keys and values
	newNodesMap := make(map[string]ComponentNode)
	for id, node := range project.NodesMap {
		// Convert node paths
		node.ID = ConvertToUnixPath(node.ID)
		node.Path = ConvertToUnixPath(node.Path)

		// Convert imports paths
		for i, importPath := range node.Imports {
			node.Imports[i] = ConvertToUnixPath(importPath)
		}

		// Convert importedBy paths
		for i, importedBy := range node.ImportedBy {
			node.ImportedBy[i] = ConvertToUnixPath(importedBy)
		}

		// Convert children paths recursively
		convertChildrenPaths(&node)

		// Add to new map with Unix path as key
		newNodesMap[ConvertToUnixPath(id)] = node
	}

	// Replace the original map
	project.NodesMap = newNodesMap
}

func convertChildrenPaths(node *ComponentNode) {
	for i := range node.Children {
		child := &node.Children[i]
		child.ID = ConvertToUnixPath(child.ID)
		child.Path = ConvertToUnixPath(child.Path)

		for j, importPath := range child.Imports {
			child.Imports[j] = ConvertToUnixPath(importPath)
		}

		for j, importedBy := range child.ImportedBy {
			child.ImportedBy[j] = ConvertToUnixPath(importedBy)
		}

		convertChildrenPaths(child)
	}
}

// GetProjectJSON returns project data as JSON and saves it to disk
func GetProjectJSON(rootDir string) (string, error) {
	project, err := ScanProject(rootDir)
	if err != nil {
		return "", err
	}

	ConvertProjectPathsToUnix(&project)

	jsonData, err := json.MarshalIndent(project, "", "  ")
	if err != nil {
		return "", err
	}

	// Save to file in $HOME/.local/reactviz/
	err = saveProjectJSON(rootDir, jsonData)
	if err != nil {
		return "", err
	}

	return string(jsonData), nil
}

// saveProjectJSON saves the project JSON to a file
func saveProjectJSON(rootDir string, jsonData []byte) error {
	// Get project name from root directory
	projectName := filepath.Base(rootDir)

	// Create timestamp
	timestamp := time.Now().Format("20060102_150405")

	// Create filename
	filename := fmt.Sprintf("%s_%s.json", projectName, timestamp)

	// Get home directory
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return err
	}

	// Create target directory
	targetDir := filepath.Join(homeDir, ".local", "reactviz")
	err = os.MkdirAll(targetDir, 0755)
	if err != nil {
		return err
	}

	// Create full file path
	filePath := filepath.Join(targetDir, filename)

	// Write file
	return os.WriteFile(filePath, jsonData, 0644)
}
