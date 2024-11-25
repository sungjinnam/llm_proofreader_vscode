import * as vscode from 'vscode';
import Anthropic from '@anthropic-ai/sdk';

// function getAnthropicApiKey(): Promise<string | undefined> {
//     // Option 0: fetch from the config
//     // return vscode.workspace.getConfiguration('llm_proofreader').get('anthropicApiKey');

//     // // Option 1: Use environment variable
//     // const envApiKey = process.env.ANTHROPIC_API_KEY;
//     // // if (envApiKey) return envApiKey;
//     // if (envApiKey) return Promise.resolve(envApiKey);
//     // // If no API key found, return undefined
//     // return Promise.resolve(undefined);    
    
//     // // Option 2: Prompt user to enter key when extension activates
//     // return await vscode.window.showInputBox({
//     //     prompt: 'Please enter your Anthropic API Key',
//     //     password: true // This masks the input
//     // });
// }

async function getAnthropicApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
    const secretStorage = context.secrets;
    let apiKey = await secretStorage.get('anthropic-api-key');
    if (!apiKey) {
        // Prompt user to enter key if not found
        apiKey = await vscode.window.showInputBox({
            prompt: 'Please enter your Anthropic API Key',
            password: true // Masks the input
        });
        
        if (apiKey) {
            // Save the key securely
            await secretStorage.store('anthropic-api-key', apiKey);
        }
    }
    
    return apiKey;
}

export class AIService {
    private anthropicClient: Anthropic | null = null;
    private context: vscode.ExtensionContext;
    private initializationPromise: Promise<void>;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.initializationPromise = this.initializeClient();
    }

    private async initializeClient() {
        const config = vscode.workspace.getConfiguration('aiAssistant');
        // const apiKey = config.get<string>('anthropic.apiKey');
        const apiKey = await getAnthropicApiKey(this.context);

        if (apiKey) {
            this.anthropicClient = new Anthropic({ apiKey });
        } else {
            throw new Error('Anthropic API key is not configured');
        }
    }

    async generateCompletion(prompt: string): Promise<string> {
        // Wait for initialization to complete before proceeding
        await this.initializationPromise;        
        if (!this.anthropicClient) {
            throw new Error('AI service is not properly configured');
        }

        const config = vscode.workspace.getConfiguration('aiAssistant');
        
        // TODO: add supports for smaller local models
        const model = config.get<string>('anthropic.model') || 'claude-3-5-haiku-20241022';

        // TODO: include explanations tag/output
        const response = await this.anthropicClient.messages.create({
            model: model,
            max_tokens: 1024,
            system: 'You are a helpful writing assistant. Be concise and focus on grammar, clarity, and flow. If there are no suggestions, do not change anything. Always wrap original text with <orig></orig> (non-empty) and each suggested change with <edit></edit> tag. One <orig></orig> tag and one <edit></edit> tag should be always paired togather. Do not include any other text.\n\nFor example, `this is test sentenec` -> `<orig>this</orig><edit>This</edit> is <orig>test</orig><edit>a test</edit> <orig>sentenec</orig><edit>sentence.</edit>',
            messages: [
                { role: 'user', content: prompt }
            ]
        });
        if ('text' in response.content[0]) {
            return response.content[0].text;
        }
        throw new Error('Unexpected response format');
    }
}