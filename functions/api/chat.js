// functions/api/chat.js
// ⚠️ 以前のエラー原因となった import はありません ⚠️

// 6時間ごとのAPIキー自動交代ロジック
// 環境変数: GEMINI_API_KEY1, GEMINI_API_KEY2, GEMINI_API_KEY3, GEMINI_API_KEY4
const KEY_COUNT = 4;
const ROTATION_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * 現在の時刻に基づいて、使用すべきAPIキーを環境変数から取得します。
 * @param {object} env Cloudflare Pages Functionsの環境変数
 * @returns {string} 選択されたAPIキー
 */
function getRotatingApiKey(env) {
    const epoch = new Date('2024-01-01T00:00:00Z').getTime();
    const now = Date.now();
    const interval_number = Math.floor((now - epoch) / ROTATION_INTERVAL_MS);
    const key_index = interval_number % KEY_COUNT; 
    const key_name = `GEMINI_API_KEY${key_index + 1}`;
    const selectedKey = env[key_name];

    if (!selectedKey) {
        console.error(`ERROR: API Key '${key_name}' not found in environment variables.`);
        return null;
    }
    console.log(`Using API Key: ${key_name} (Interval: ${interval_number})`);
    return selectedKey;
}


// Cloudflare Pages Functionのエントリーポイント
export async function onRequestPost({ request, env }) {
    try {
        const rotatingApiKey = getRotatingApiKey(env);

        if (!rotatingApiKey) {
            return new Response(JSON.stringify({ error: "API Key is missing or invalid." }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        const { user_message, character_config } = await request.json();

        // 1. リクエストペイロードの構築 (API直接呼び出し用)
        const requestBody = {
            model: "gemini-2.5-flash",
            contents: [
                { role: "user", parts: [{ text: user_message }] }
            ],
            config: {
                systemInstruction: character_config.system_prompt,
                temperature: 0.9, 
            },
        };

        // 2. Google Gemini APIの直接呼び出し (Fetch APIを使用)
        const apiResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                // APIキーをAuthorizationヘッダーで渡す 
                "Authorization": `Bearer ${rotatingApiKey}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!apiResponse.ok) {
            // Google API側からのエラーをキャッチ
            const errorData = await apiResponse.json();
            throw new Error(`Google API Error: ${errorData.error.message || apiResponse.statusText}`);
        }

        const data = await apiResponse.json();
        
        // 3. 応答の処理
        const bot_response = data.candidates[0].content.parts[0].text;

        return new Response(JSON.stringify({ response: bot_response }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (e) {
        console.error("Request handling error:", e);
        return new Response(JSON.stringify({ error: e.message || "An unknown error occurred." }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
