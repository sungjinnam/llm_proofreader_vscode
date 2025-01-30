# LLM Proofreader

A VS Code extension that provides AI-powered grammar and writing assistance using local LLM models through Ollama.
This project is also an LLM code collaboration experiment. 
I don't have workig knowledge of TypeScript or VSCode extension development. But most codes and documents are written with LLM. 

## Features

- Grammar and writing suggestions for selected text or current line
- Real-time diagnostics with quick-fix actions
- Support for local LLM models via Ollama
- Inline suggestions with one-click apply

## Requirements

- VS Code 1.85.0 or higher
- Ollama installed and running locally (http://localhost:11434)
- A compatible LLM model loaded in Ollama

## Installation

1. Clone the repository
2. `cd llm_proofreader` (where `package.json` file exists)
3. `npm install` to install dependencies
4. `npm run compile` to build

## Development

- `Cntrl + P`: Start Debugging. This will bring up the new window to test the extension.
- Make changes in `src/extension.ts` and reload to see updates
- Run `npm run watch` for continuous compilation during development

## Extension Settings

This extension contributes the following settings:

* `aiAssistant.apiProvider`: Select the AI provider to use (azure/openai/anthropic)
* `aiAssistant.ollama.model`: Specify the Ollama model to use (default: "llama3.2:1b")

## Usage

1. Select text or place cursor on a line you want to check
2. Open command palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
3. Run "Assist Grammar" command
4. Click on suggestions to apply fixes or use quick-fix actions

## Known Issues

- Needs improvements in parsing the suggested edits and apply in the correct locations.
- Currently only supports local Ollama models
- Limited to text-based files
- Requires manual invocation through command palette

## License

[to be updated]

## Release Notes

### 0.0.1

- Initial release
- Basic grammar checking functionality
- Support for Ollama integration
- Diagnostic and quick-fix features