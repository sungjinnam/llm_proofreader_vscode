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

    // Singleton instance
    const aiService = new AIService(context);
    // Create diagnostic collection
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('grammarCheck');
    // Clear any existing diagnostics before starting new evaluation
    diagnosticCollection.clear();

    // Register command to apply fixes
    let disposableGrammarFix = vscode.commands.registerCommand('extension.applyGrammarFix', async (args) => {
        console.log('Received args:', args);
        
        const range = new vscode.Range(
            new vscode.Position(args.range.start.line, args.range.start.character),
            new vscode.Position(args.range.end.line, args.range.end.character)
        );
        
        const edit = new vscode.WorkspaceEdit();
        edit.replace(vscode.Uri.parse(args.document.uri), range, args.replacement);
        
        const success = await vscode.workspace.applyEdit(edit);
        console.log('Edit applied:', success);
        
        if (success) {
            // Calculate the position shift
            const lengthDiff = args.replacement.length - (range.end.character - range.start.character);
            
            // Get current diagnostics
            const currentDiagnostics = diagnosticCollection.get(vscode.Uri.parse(args.document.uri)) || [];
            
            // Filter and adjust remaining diagnostics
            const remainingDiagnostics = currentDiagnostics.map(diagnostic => {
                const diagnosticRange = diagnostic.range;
                
                // Skip if this is the diagnostic we just fixed
                if (diagnosticRange.start.line === range.start.line &&
                    diagnosticRange.start.character === range.start.character &&
                    diagnosticRange.end.line === range.end.line &&
                    diagnosticRange.end.character === range.end.character) {
                    return null;
                }
                
                // Adjust positions for diagnostics on the same line after the edit
                if (diagnosticRange.start.line === range.start.line && 
                    diagnosticRange.start.character > range.start.character) {
                    const newStart = new vscode.Position(
                        diagnosticRange.start.line,
                        diagnosticRange.start.character + lengthDiff
                    );
                    const newEnd = new vscode.Position(
                        diagnosticRange.end.line,
                        diagnosticRange.end.character + lengthDiff
                    );
                    
                    // Create a new diagnostic with adjusted range
                    const newDiagnostic = new vscode.Diagnostic(
                        new vscode.Range(newStart, newEnd),
                        diagnostic.message,
                        diagnostic.severity
                    );
                    newDiagnostic.source = diagnostic.source;
                    // Adjust the command arguments in diagnostic.code
                    if (diagnostic.code && typeof diagnostic.code === 'object') {
                        try {
                            // Clean up the query string before parsing
                            const query = diagnostic.code.target.query.replace(/^\?/, '');
                            const commandArgs = JSON.parse(decodeURIComponent(query));
                            
                            // Adjust the positions
                            commandArgs.range.start.character += lengthDiff;
                            commandArgs.range.end.character += lengthDiff;
                            
                            newDiagnostic.code = {
                                value: 'Apply Suggestion',
                                target: vscode.Uri.parse(`command:extension.applyGrammarFix?${encodeURIComponent(JSON.stringify(commandArgs))}`)
                            };
                        } catch (error) {
                            console.error('Error parsing diagnostic code:', error);
                            // If we can't parse the code, keep the original
                            newDiagnostic.code = diagnostic.code;
                        }
                    }
                    
                    return newDiagnostic;
                }
                
                return diagnostic;
            }).filter((diagnostic): diagnostic is vscode.Diagnostic => diagnostic !== null);
            
            // Update diagnostics with remaining ones
            diagnosticCollection.set(vscode.Uri.parse(args.document.uri), remainingDiagnostics);
        }
    });
    context.subscriptions.push(disposableGrammarFix);

    let assistGrammar = vscode.commands.registerCommand('extension.assistGrammar', async () => {

        // const aiService = getAIService();
        const editor = vscode.window.activeTextEditor;

        if (!aiService) {
            vscode.window.showErrorMessage('No AIService is actived');
            return;
        }
        else if (!editor) {
            vscode.window.showErrorMessage('No active editor found');
            return;
        } else {


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
                    
                // Parse edits from the result
                // const edits = parseEdits(result);
                const fullText = document.getText(range);
                const edits = parseEdits(result, fullText, document, range);
                console.log('parsed output: %s', edits);

                // Create diagnostics for each edit
                if (edits && edits.length > 0) {                
                    // Create diagnostics for all edits at once
                    // In assistGrammar where we create the diagnostics:
                    const diagnostics = edits.map(edit => {
                        const diagnostic = new vscode.Diagnostic(
                            edit.range,
                            edit.suggestion,
                            vscode.DiagnosticSeverity.Information
                        );
                        
                        diagnostic.source = 'Grammar Assistant';
                        const commandArgs = {
                            document: {
                                uri: document.uri.toString() // Convert URI to string
                            },
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

                        diagnostic.code = {
                            value: 'Apply Suggestion',
                            target: vscode.Uri.parse(`command:extension.applyGrammarFix?${encodeURIComponent(JSON.stringify(commandArgs))}`)
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
            } catch (error) {
                vscode.window.showErrorMessage('Error generating markdown assistance: ' + error);
            }            
        }
    });
    
    context.subscriptions.push(assistGrammar);

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
                                // Clean up the query string before parsing
                                const query = diagnostic.code.target.query.replace(/^\?/, '');
                                const params = JSON.parse(decodeURIComponent(query));
                                
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
