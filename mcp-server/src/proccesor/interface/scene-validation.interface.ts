export type SceneStepIntent = 'answer' | 'off_topic' | 'refuse';

export interface SceneStepValidationResult {
    intent: SceneStepIntent;
    validated_value: string | null;
    reply_message: string | null;
}
