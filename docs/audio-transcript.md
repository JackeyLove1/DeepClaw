音频理解
音频理解模型可以根据您传入的音频进行回答，支持音频 URL 和 Base64 编码两种传入方式，适用于音频分析等场景。
快速开始
注意：获取 API Key 等准备工作，请参考 首次调用API。
通过音频 URL 方式传入模型快速体验音频理解效果，示例代码如下。
Curl
curl --location --request POST 'https://api.xiaomimimo.com/v1/chat/completions' \
--header "api-key: $MIMO_API_KEY" \
--header "Content-Type: application/json" \
--data-raw 
'{
    "model": "mimo-v2-omni",
    "messages": [
        {
            "role": "system",
            "content": "You are MiMo, an AI assistant developed by Xiaomi. Today is date: Tuesday, December 16, 2025. Your knowledge cutoff date is December 2024."
        },
        {
            "role": "user",
            "content": [
                {
                    "type": "input_audio",
                    "input_audio": {
                        "data": "https://example-files.cnbj1.mi-fds.com/example-files/audio/audio_example.wav"
                    }
                },
                {
                    "type": "text",
                    "text": "please describe the content of the audio"
                }
            ]
        }
    ],
    "max_completion_tokens": 1024
}'
￼
Python
import
 os
from openai import
 OpenAI

client = OpenAI(
    api_key=os.environ.get("MIMO_API_KEY"),
    base_url="https://api.xiaomimimo.com/v1"
)

completion = client.chat.completions.create(
    model="mimo-v2-omni",
    messages=[
        {
            "role": "system",
            "content": "You are MiMo, an AI assistant developed by Xiaomi. Today is date: Tuesday, December 16, 2025. Your knowledge cutoff date is December 2024."
        },
        {
            "role": "user",
            "content": [
                {
                    "type": "input_audio",
                    "input_audio": {
                        "data": "https://example-files.cnbj1.mi-fds.com/example-files/audio/audio_example.wav"
                    }
                },
                {
                    "type": "text",
                    "text": "please describe the content of the audio"
                }
            ]
        }
    ],
    max_completion_tokens=1024
)

print(completion.model_dump_json())
￼
响应结果
{
    "id": "272d942b15534367abededc13e288f08",
    "choices": [
        {
            "finish_reason": "stop",
            "index": 0,
            "message": {
                "content": "The audio features a speaker asking a question. The content of the speech is: \"Good morning, could you tell me what the weather will be like today?\"",
                "role": "assistant",
                "tool_calls": null,
                "reasoning_content": "The user wants to know the weather forecast for today.\n\n1.  **Identify the user's core request:** The user is asking for the weather forecast for \"today\".\n2.  **Analyze the input:** The input is an audio file (implicitly, based on the prompt \"describe the content of the audio\"). However, the user provided text: \"00:00 Good morning, could you tell me what the weather will be like today?\". This text is a transcription of the audio.\n3.  **Determine the capability:** I am an AI assistant. I do not have real-time access to the user's location or current weather data unless provided. I also cannot \"hear\" the audio directly in this text-based context, but the prompt implies I should treat the provided text as the audio content.\n4.  **Formulate the response:**\n    *   Acknowledge the request.\n    *   State the limitation: I don't know the user's location and don't have real-time weather access.\n    *   Provide a general response or ask for the location to give a specific answer.\n    *   Since the prompt asks to \"describe the content of the audio\", I should focus on transcribing or summarizing what was said in the audio clip provided (represented by the text \"00:00 Good morning, could you tell me what the weather will be like today?\").\n\n*Self-Correction/Refinement:* The prompt asks me to \"describe the content of the audio\". It does *not* explicitly ask me to answer the question *in* the audio (the weather). It asks for a description of the audio itself.\n*   **Audio Content:** A voice saying \"Good morning, could you tell me what the weather will be like today?\"\n*   **Speaker:** Likely a user asking an assistant.\n*   **Tone:** Polite, inquiring.\n\nLet's re-read the prompt carefully.\n\"User: 00:00 Good morning, could you tell me what the weather will be like today? describe the content of the audio\"\n\nThe user provided a timestamp and a transcript. Then the instruction is \"describe the content of the audio\".\nSo the task is to describe what is happening in the audio clip based on the text provided.\n\n**Plan:**\n1.  Transcribe the text exactly as spoken.\n2.  Identify the speaker's intent (asking for weather).\n3.  Note the polite greeting.\n\n**Drafting the description:**\nThe audio features a speaker greeting the listener with \"Good morning\" and then politely asking for a weather forecast for the current day. The speaker asks, \"could you tell me what the weather will be like today?\"\n\nThis seems to be the most direct answer to \"describe the content of the audio\".\n\nHowever, usually, when users ask \"describe the content of the audio\" in these multimodal contexts, they might also want the AI to *act* on the content. But strictly speaking, the instruction is to *describe* the content.\nLet's provide the transcription as the primary description, and perhaps a brief summary of the intent.\n\n**Final Output Structure:**\n1.  Transcription of the spoken words.\n2.  Summary of the request (asking for weather).\n\nLet's stick to a clear description.\n\n\"The audio contains a spoken sentence where a person says: 'Good morning, could you tell me what the weather will be like today?'\"\n\nThis is accurate and directly answers the prompt. I will provide the transcription.\n\nWait, looking at the user prompt again:\n\"00:00 Good morning, could you tell me what the weather will be like today?\"\n\"describe the content of the audio\"\n\nThe user *gave* me the text and asked me to describe the content. This is a bit recursive.\nPerhaps the user wants me to confirm what was said.\nOr perhaps the user is testing my ability to parse the input.\n\nLet's provide a concise description.\n\n**Content Description:**\nThe audio clip features a person speaking. They start with a greeting, \"Good morning,\" followed by a question inquiring about the weather forecast for the current day, asking, \"could you tell me what the weather will be like today?\"\n\nThis covers the \"what\" (speech), the \"who\" (speaker), and the \"what about\" (content).\n\nLet's double-check if there's any other interpretation. Maybe \"describe the content\" implies analyzing the tone? The tone is polite.\nI will stick to the factual description of the speech content.\n\n**Final Polish:**\nThe audio features a speaker asking a question. The speaker says, \"Good morning, could you tell me what the weather will be like today?\" This indicates a request for a weather forecast."
            }
        }
    ],
    "created": 1773832402,
    "model": "mimo-v2-omni",
    "object": "chat.completion",
    "usage": {
        "completion_tokens": 1005,
        "prompt_tokens": 86,
        "total_tokens": 1091,
        "completion_tokens_details": {
            "reasoning_tokens": 970
        },
        "prompt_tokens_details": {
            "audio_tokens": 25,
            "cached_tokens": 84
        }
    }
}
￼
支持的模型列表
当前仅支持 mimo-v2-omni 模型。
音频传入方式
支持的音频传入方式如下：
• 音频 URL 传入：需提供公网可访问的音频 URL 地址。
• Base64 编码传入：将音频转换为 Base64 编码字符串后再传入。
音频 URL 传入
通过公网可访问的音频 URL 地址直接传入音频文件，适用于音频文件已存储在公网可访问环境的场景。单个音频文件大小不能超过 100 MB。
Curl
curl --location --request POST 'https://api.xiaomimimo.com/v1/chat/completions' \
--header "api-key: $MIMO_API_KEY" \
--header "Content-Type: application/json" \
--data-raw 
'{
    "model": "mimo-v2-omni",
    "messages": [
        {
            "role": "system",
            "content": "You are MiMo, an AI assistant developed by Xiaomi. Today is date: Tuesday, December 16, 2025. Your knowledge cutoff date is December 2024."
        },
        {
            "role": "user",
            "content": [
                {
                    "type": "input_audio",
                    "input_audio": {
                        "data": "https://example-files.cnbj1.mi-fds.com/example-files/audio/audio_example.wav"
                    }
                },
                {
                    "type": "text",
                    "text": "please describe the content of the audio"
                }
            ]
        }
    ],
    "max_completion_tokens": 1024
}'
￼
Python
import
 os
from openai import
 OpenAI

client = OpenAI(
    api_key=os.environ.get("MIMO_API_KEY"),
    base_url="https://api.xiaomimimo.com/v1"
)

completion = client.chat.completions.create(
    model="mimo-v2-omni",
    messages=[
        {
            "role": "system",
            "content": "You are MiMo, an AI assistant developed by Xiaomi. Today is date: Tuesday, December 16, 2025. Your knowledge cutoff date is December 2024."
        },
        {
            "role": "user",
            "content": [
                {
                    "type": "input_audio",
                    "input_audio": {
                        "data": "https://example-files.cnbj1.mi-fds.com/example-files/audio/audio_example.wav"
                    }
                },
                {
                    "type": "text",
                    "text": "please describe the content of the audio"
                }
            ]
        }
    ],
    max_completion_tokens=1024
)

print(completion.model_dump_json())
￼
Base64 编码传入
将音频文件转换为 Base64 编码字符串后传入，适用于音频文件无法通过公网 URL 访问的场景。转换后的 Base64 编码的字符串大小不能超过 10 MB。
请在 Base64 编码前携带前缀：data:{MIME_TYPE};base64,$BASE64_AUDIO
• {MIME_TYPE}：音频的 MIME 类型（媒体类型），用于标识音频格式，需替换为实际音频对应的 MIME 值。
• $BASE64_AUDIO：音频文件的纯 Base64 编码字符串（不含任何前缀）。
Curl
curl --location --request POST 'https://api.xiaomimimo.com/v1/chat/completions' \
--header "api-key: $MIMO_API_KEY" \
--header "Content-Type: application/json" \
--data-raw 
'{
    "model": "mimo-v2-omni",
    "messages": [
        {
            "role": "system",
            "content": "You are MiMo, an AI assistant developed by Xiaomi. Today is date: Tuesday, December 16, 2025. Your knowledge cutoff date is December 2024."
        },
        {
            "role": "user",
            "content": [
                {
                    "type": "input_audio",
                    "input_audio": {
                        "data": "data:{MIME_TYPE};base64,$BASE64_AUDIO"
                    }
                },
                {
                    "type": "text",
                    "text": "please describe the content of the audio"
                }
            ]
        }
    ],
    "max_completion_tokens": 1024
}'
￼
Python
import
 os
from openai import
 OpenAI

client = OpenAI(
    api_key=os.environ.get("MIMO_API_KEY"),
    base_url="https://api.xiaomimimo.com/v1"
)

completion = client.chat.completions.create(
    model="mimo-v2-omni",
    messages=[
        {
            "role": "system",
            "content": "You are MiMo, an AI assistant developed by Xiaomi. Today is date: Tuesday, December 16, 2025. Your knowledge cutoff date is December 2024."
        },
        {
            "role": "user",
            "content": [
                {
                    "type": "input_audio",
                    "input_audio": {
                        "data": "data:{MIME_TYPE};base64,$BASE64_AUDIO"
                    }
                },
                {
                    "type": "text",
                    "text": "please describe the content of the audio"
                }
            ]
        }
    ],
    max_completion_tokens=1024
)

print(completion.model_dump_json())
￼
音频限制
• 音频格式：MP3，WAV，FLAC，M4A，OGG。
音频文件格式变种较多，不能保证所有文件都能被识别，请通过测试验证文件能够被正常识别。
• 音频大小：
• 以 URL 方式传入时：单个音频文件大小不超过 100 MB。
• 以 Base64 编码传入时：单个音频的 Base64 编码字符串大小不超过 10 MB。
• 音频数量：传入多个音频时，音频数量受模型上下文长度限制，所有音频和文本的总 Token 数必须小于模型的上下文长度。
注：计算音频的 Token 请参考 音频 Token 用量说明。模型上下文长度请参考 定价与限速。
音频 Token 用量说明
音频的 Token 转化请参考以下代码。估算结果仅供参考，实际用量以 API 响应为准。
总 Tokens 数 ≈ 音频时长（单位：秒，例如：10.6 秒）* 6.25