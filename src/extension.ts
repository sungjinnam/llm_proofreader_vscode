// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { AIService } from './aiService';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "llm_proofreader" is now active!');

    // // The command has been defined in the package.json file
    // // Now provide the implementation of the command with registerCommand
    // // The commandId parameter must match the command field in package.json
    // const disposable = vscode.commands.registerCommand('llm_proofreader.helloWorld', () => {
    //     // The code you place here will be executed every time your command is executed
    //     // Display a message box to the user
    //     vscode.window.showInformationMessage('Hello World from vscode_assistant_azure!');
    
    // Singleton instance
    let aiServiceInstance: AIService | undefined;
    // Helper function to get or create AIService
    const getAIService = async (): Promise<AIService> => {
        if(!aiServiceInstance) {
            aiServiceInstance = new AIService(context);
        }
        return aiServiceInstance
    }

    let assistCode = vscode.commands.registerCommand('extension.assistCode', async () => {
        const aiService = await getAIService();
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            const selection = editor.selection;
            const text = document.getText(selection);

            const prompt = `Assist with the following code:\n\n${text}\n\nProvide suggestions or improvements:`;
            
            try {
                const result = await aiService.generateCompletion(prompt);
                const newDoc = await vscode.workspace.openTextDocument({ content: result, language: 'markdown' });
                vscode.window.showTextDocument(newDoc, vscode.ViewColumn.Beside);
            } catch (error) {
                vscode.window.showErrorMessage('Error generating code assistance: ' + error);
            }
        }
    });

    let assistGrammar = vscode.commands.registerCommand('extension.assistGrammar', async () => {
        const aiService = await getAIService();
        const editor = vscode.window.activeTextEditor;

        // Create diagnostic collection
        const diagnosticCollection = vscode.languages.createDiagnosticCollection('grammarCheck');
        
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found');
            return;
        } else {
            // Clear any existing diagnostics before starting new evaluation
            diagnosticCollection.clear();

            const document = editor.document;
            const selection = editor.selection;
            // const text = document.getText(selection);
            let range: vscode.Range
            let text: string;

            if (selection.isEmpty){
                // if no text is selected, use the current line
                const line = document.lineAt(selection.active.line);
                range = line.range;
                text = line.text;
            } else {
                // use the selected text
                range = new vscode.Range(
                    selection.start.line,
                    selection.start.character,
                    selection.end.line,
                    selection.end.character,
                )
                text = document.getText(selection);
            }

            const prompt = `${text}`;
            try {
                const result = await aiService.generateCompletion(prompt);
                console.log('initial LLM output: %s', result);
                //     const newDoc = await vscode.workspace.openTextDocument({ content: result, language: 'markdown' });
                //     vscode.window.showTextDocument(newDoc, vscode.ViewColumn.Beside);
                    
                // Parse edits from the result
                // const edits = parseEdits(result);
                const fullText = document.getText(range);
                const edits = parseEdits(result, fullText, document, range);
                console.log('parsed output: %s', edits);

                // Create diagnostics for each edit
                // TODO: shift in subsequent suggestions' position. e.g., suggestions with insert -> should shift the rage info for the later suggestions.
                if (edits && edits.length > 0) {                
                    // Create diagnostics for all edits at once
                    const diagnostics = edits.map(edit => {
                        const diagnostic = new vscode.Diagnostic(
                            edit.range,
                            edit.suggestion,
                            vscode.DiagnosticSeverity.Information
                        );
                        
                        diagnostic.source = 'Grammar Assistant';
                        // Create a simple object with just the necessary data
                        const commandArgs = {
                            replacement: edit.replacement,
                            range: {
                                start: {
                                    line: edit.range.start.line, 
                                    character: edit.range.start.character
                                },
                                end: {
                                    line: edit.range.end.line, 
                                    character: edit.range.end.character
                                }
                            }
                        };
                        // Create the command directly in the diagnostic
                        diagnostic.code = {
                            value: 'Apply Suggestion',
                            target: vscode.Uri.parse(`command:extension.applyGrammarFix?${encodeURIComponent(JSON.stringify([commandArgs]))}`)
                        };

                        return diagnostic;
                    });

                    // Show all diagnostics
                    diagnosticCollection.set(document.uri, diagnostics);
                } else {
                    // Clear any existing diagnostics if no suggestions
                    diagnosticCollection.clear();
                    vscode.window.showInformationMessage('No suggestions found for the selected text.');
                }
                // Register command to apply fixes
                let disposable = vscode.commands.registerCommand('extension.applyGrammarFix', async (args) => {
                    const commandArgs = Array.isArray(args) ? args[0] : args;
                    
                    const range = new vscode.Range(
                        new vscode.Position(commandArgs.range.start.line, commandArgs.range.start.character),
                        new vscode.Position(commandArgs.range.end.line, commandArgs.range.end.character)
                    );
                    
                    const edit = new vscode.WorkspaceEdit();
                    edit.replace(document.uri, range, commandArgs.replacement);
                    await vscode.workspace.applyEdit(edit);

                    // Get current diagnostics
                    const currentDiagnostics = diagnosticCollection.get(document.uri) || [];
                    
                    // Calculate position shift
                    const lengthDiff = commandArgs.replacement.length - (range.end.character - range.start.character);
                    
                    // Update remaining diagnostics with new positions
                    const updatedDiagnostics = currentDiagnostics
                        .filter(d => {
                            // Remove diagnostics that overlap with the applied edit
                            return !(d.range.start.line === range.start.line &&
                                d.range.end.line === range.end.line &&
                                d.range.start.character === range.start.character &&
                                d.range.end.character === range.end.character);
                        })
                        .map(d => {
                            // Only adjust positions if the diagnostic comes after the edit
                            if (d.range.start.line === range.start.line && d.range.start.character > range.start.character) {
                                // Adjust the position on the same line
                                const newRange = new vscode.Range(
                                    new vscode.Position(d.range.start.line, d.range.start.character + lengthDiff),
                                    new vscode.Position(d.range.end.line, d.range.end.character + lengthDiff)
                                );
                                
                                const newDiagnostic = new vscode.Diagnostic(
                                    newRange,
                                    d.message,
                                    d.severity
                                );
                                
                                newDiagnostic.source = d.source;
                                newDiagnostic.code = d.code;
                                
                                return newDiagnostic;
                            }
                            return d;
                        });

                    // Update diagnostics collection
                    diagnosticCollection.set(document.uri, updatedDiagnostics);
                });
                context.subscriptions.push(disposable);          
            } catch (error) {
                vscode.window.showErrorMessage('Error generating markdown assistance: ' + error);
            }            
        }
    });
    
    context.subscriptions.push(assistCode, assistGrammar);

    // Helper function to parse edits from LLM response
    function parseEdits(
        result: string, 
        fullText: string, 
        document: vscode.TextDocument, 
        range: vscode.Range
    ): Array<{
        original: string;
        suggestion: string;
        replacement: string;
        range: vscode.Range;
    }> {
        const regex = /<orig>(.*?)<\/orig>.*?<edit>(.*?)<\/edit>/gs;
        const matches = [...result.matchAll(regex)];
        console.log('parsed output:', matches);
        
        return matches.map(match => {
            const original = match[1];
            const replacement = match[2];
            
            // Skip if the replacement is identical to the original
            if (original == replacement) {
                return null;
            }            
            // Find position of original text in the full text
            const startIndex = fullText.indexOf(original);
            if (startIndex === -1) {
                return null;
            }
            
            // Calculate start and end positions
            const startPos = document.positionAt(document.offsetAt(range.start) + startIndex);
            const endPos = document.positionAt(document.offsetAt(range.start) + startIndex + original.length);
            
            return {
                original,
                suggestion: `Change "${original}" to "${replacement}"`,
                replacement,
                range: new vscode.Range(startPos, endPos)
            };
        })
        .filter((edit): edit is NonNullable<typeof edit> => 
            edit !== null && 
            edit.original !== edit.replacement
        );
    }

    // Register code action provider
    const codeActionProvider = vscode.languages.registerCodeActionsProvider(
        '*', // or specific language identifiers
        {
            provideCodeActions(document, range, context, token) {
                const diagnostics = context.diagnostics;
                const codeActions = [];

                for (const diagnostic of diagnostics) {
                    if (diagnostic.source === 'Grammar Assistant') {
                        const action = new vscode.CodeAction(
                            'Apply suggestion',
                            vscode.CodeActionKind.QuickFix
                        );
                        if (diagnostic.code && typeof diagnostic.code === 'object') {
                            try {
                                const params = JSON.parse(
                                    decodeURIComponent(
                                        diagnostic.code.target.query
                                    )
                                );
                                
                                action.command = {
                                    command: 'extension.applyGrammarFix',
                                    title: 'Apply suggestion',
                                    arguments: [params]
                                };
                                
                                action.diagnostics = [diagnostic];
                                action.isPreferred = true;
                                
                                codeActions.push(action);
                            } catch (error) {
                                console.error('Error parsing diagnostic code:', error);
                            }
                        }
                    }
                }

                return codeActions;
            }
        }
    );

    context.subscriptions.push(codeActionProvider);    
}
// This method is called when your extension is deactivated
export function deactivate() {}
