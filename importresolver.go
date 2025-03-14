package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// AliasConfig holds the project's import alias configuration
type AliasConfig struct {
	BaseURL string            // The base URL for resolving imports (e.g., "src")
	Aliases map[string]string // Map of alias -> actual path
}

// ReadProjectConfig reads project configuration files to detect import aliases
func ReadProjectConfig(rootDir string) (AliasConfig, error) {
	config := AliasConfig{
		BaseURL: "",
		Aliases: make(map[string]string),
	}

	// Check for common configuration files
	configFiles := []string{
		"jsconfig.json",
		"tsconfig.json",
		"webpack.config.js",
		"craco.config.js",
		".babelrc",
		"babel.config.js",
		"package.json", // Some projects define aliases in package.json
	}

	for _, configFile := range configFiles {
		configPath := filepath.Join(rootDir, configFile)
		if _, err := os.Stat(configPath); err == nil {
			switch filepath.Ext(configFile) {
			case ".json":
				err := parseJSONConfig(configPath, &config)
				if err == nil {
					return config, nil
				}
			case ".js":
				// For JS configs, this would be more complex and might require executing JS
				// For now, we could look for common patterns but a full solution would
				// need a JS parser or even Node.js execution
				parseJSConfig(configPath, &config)
			}
		}
	}

	// If no explicit config is found, check for src directory as a common default
	if _, err := os.Stat(filepath.Join(rootDir, "src")); err == nil {
		config.BaseURL = "src"
	}

	return config, nil
}

// JSConfig represents the structure of a jsconfig.json or tsconfig.json file
type JSConfig struct {
	CompilerOptions struct {
		BaseURL string              `json:"baseUrl,omitempty"`
		Paths   map[string][]string `json:"paths,omitempty"`
	} `json:"compilerOptions,omitempty"`
}

// PackageJSON represents the structure of a package.json file, focusing on alias config
type PackageJSON struct {
	Alias map[string]string `json:"alias,omitempty"`
	Jest  struct {
		ModuleNameMapper map[string]string `json:"moduleNameMapper,omitempty"`
	} `json:"jest,omitempty"`
}

// parseJSONConfig parses JSON configuration files for import aliases
func parseJSONConfig(configPath string, config *AliasConfig) error {
	data, err := os.ReadFile(configPath)
	if err != nil {
		return err
	}

	// Try to parse as jsconfig/tsconfig.json
	if strings.HasSuffix(configPath, "jsconfig.json") || strings.HasSuffix(configPath, "tsconfig.json") {
		var jsConfig JSConfig
		if err := json.Unmarshal(data, &jsConfig); err == nil {
			config.BaseURL = jsConfig.CompilerOptions.BaseURL

			// Process paths (aliases)
			for aliasPattern, targetPaths := range jsConfig.CompilerOptions.Paths {
				if len(targetPaths) > 0 {
					// Convert pattern "components/*" to "components/"
					alias := strings.TrimSuffix(aliasPattern, "/*")

					// Remove trailing /* from target path as well
					target := strings.TrimSuffix(targetPaths[0], "/*")

					config.Aliases[alias] = target
				}
			}
			return nil
		}
	}

	// Try to parse as package.json
	if strings.HasSuffix(configPath, "package.json") {
		var packageJSON PackageJSON
		if err := json.Unmarshal(data, &packageJSON); err == nil {
			// Direct aliases
			for alias, target := range packageJSON.Alias {
				config.Aliases[alias] = target
			}

			// Jest module mapper (often used for aliases too)
			for pattern, target := range packageJSON.Jest.ModuleNameMapper {
				// Clean up regex patterns like "^components/(.*)$" to "components"
				alias := strings.TrimPrefix(pattern, "^")
				alias = strings.TrimSuffix(alias, "/(.*)$")
				alias = strings.TrimSuffix(alias, "(.*)$")

				// Clean up target like "<rootDir>/src/components/$1" to "src/components"
				target = strings.Replace(target, "<rootDir>/", "", 1)
				target = strings.TrimSuffix(target, "/$1")

				if alias != "" && target != "" {
					config.Aliases[alias] = target
				}
			}
		}
	}

	return nil
}

// parseJSConfig looks for common alias patterns in JS config files
func parseJSConfig(configPath string, config *AliasConfig) {
	// This is a simplified approach - a full solution would need a JS parser
	data, err := os.ReadFile(configPath)
	if err != nil {
		return
	}

	content := string(data)

	// Look for baseUrl pattern
	baseUrlPatterns := []string{
		"baseUrl: ['\"](.*?)['\"]",
		"baseUrl:\\s*['\"](.*?)['\"]",
	}

	for _, pattern := range baseUrlPatterns {
		re := regexp.MustCompile(pattern)
		matches := re.FindStringSubmatch(content)
		if len(matches) > 1 {
			config.BaseURL = matches[1]
			break
		}
	}

	// Look for alias patterns (very simplified)
	aliasPatterns := []string{
		"alias\\s*:\\s*{([^}]*)}",
		"resolve\\s*:\\s*{\\s*alias\\s*:\\s*{([^}]*)}",
	}

	for _, pattern := range aliasPatterns {
		re := regexp.MustCompile(pattern)
		matches := re.FindStringSubmatch(content)
		if len(matches) > 1 {
			aliasBlock := matches[1]
			// Very simple key-value extraction, would miss many cases
			keyValueRe := regexp.MustCompile(`['"](\w+)['"]:\s*['"]([^'"]+)['"]`)
			kvMatches := keyValueRe.FindAllStringSubmatch(aliasBlock, -1)

			for _, kv := range kvMatches {
				if len(kv) > 2 {
					config.Aliases[kv[1]] = kv[2]
				}
			}
		}
	}
}

// ResolveImportPath resolves an import path using project alias configuration
func ResolveImportPath(importPath string, config AliasConfig, projectDir string, currentDir string) string {
	// If it's a relative import, resolve it relative to the current file
	if strings.HasPrefix(importPath, ".") {
		return filepath.Join(currentDir, importPath)
	}

	// If it's an absolute import starting with /, resolve from project root
	if strings.HasPrefix(importPath, "/") {
		return filepath.Join(projectDir, importPath[1:])
	}

	// Check if the import uses an alias
	for alias, target := range config.Aliases {
		if strings.HasPrefix(importPath, alias) {
			// Replace the alias prefix with the target path
			relativePath := strings.TrimPrefix(importPath, alias)
			if strings.HasPrefix(relativePath, "/") {
				relativePath = relativePath[1:]
			}

			// If the target is an absolute path, use it directly
			if filepath.IsAbs(target) {
				return filepath.Join(target, relativePath)
			}

			// If we have a baseURL, resolve from there
			if config.BaseURL != "" {
				return filepath.Join(projectDir, config.BaseURL, target, relativePath)
			}

			// Otherwise resolve from project root
			return filepath.Join(projectDir, target, relativePath)
		}
	}

	// If no alias matches but we have a baseURL, try resolving from there
	if config.BaseURL != "" {
		return filepath.Join(projectDir, config.BaseURL, importPath)
	}

	// As a fallback, try to resolve from project root
	return filepath.Join(projectDir, importPath)
}
