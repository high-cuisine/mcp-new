export interface ToolCall {
    id: string;
    type: string;
    function: {
        name: string;
        arguments: string;
    };
}

export interface Message {
    role: string;
    content: string | null;
    tool_calls: ToolCall[] | null;
    refusal: string | null;
    annotations: any[];
}

export interface Choice {
    index: number;
    message: Message;
    logprobs: any | null;
    finish_reason: string;
}

export interface Usage {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_tokens_details: {
        cached_tokens: number;
        audio_tokens: number;
    };
    completion_tokens_details: {
        reasoning_tokens: number;
        audio_tokens: number;
        accepted_prediction_tokens: number;
        rejected_prediction_tokens: number;
    };
}

export class LlmResponseDto {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Choice[];
    usage: Usage;
    service_tier: string;
    system_fingerprint: string;
}
