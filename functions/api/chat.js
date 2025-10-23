// functions/api/chat.js
import { GoogleGenAI } from "@google/genai";

// 6時間ごとのAPIキー自動交代ロジック
// 環境変数からどのキーを使うべきかを決定します。
const KEY_COUNT = 4;
// 6時間 = 6 * 60分 * 60秒 * 1000ミリ秒
const ROTATION_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * 現在の時刻に基づいて、使用すべきAPIキーを環境変数から取得します。
 * @param {object} env Cloudflare Pages Functionsの環境変数
 * @returns {string} 選択されたAPIキー
 */
function getRotatingApiKey(env) {
    // 固定のエポック（基準日）を設定。ここでは2024年1月1日UTCを使用
    const epoch = new Date('2024-01-01T00:00:00Z').getTime();
    const now = Date.now();
    
    // エポックからの経過時間を6時間のインターバルで割る
    const interval_number = Math.floor((now - epoch) / ROTATION_INTERVAL_MS);
    
    // インターバル番号をキーの数（4）で割った余りでインデックスを決定（0, 1, 2, 3）
    const key_index = interval_number % KEY_COUNT; 
    
    // 環境変数名に変換 (例: GEMINI_API_KEY1, GEMINI_API_KEY2...)
    const key_name = `GEMINI_API_KEY${key_index + 1}`;
    
    const selectedKey = env[key_name];

    if (!selectedKey) {
        console.error(`ERROR: API Key '${key_name}' not found in environment variables.`);
        // 開発環境向けに警告を返し、処理を止めます
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
        
        // APIキーのインスタンス化
        const ai = new GoogleGenAI({ apiKey: rotatingApiKey });

        const { user_message, character_config } = await request.json();

        // 1. プロンプトの構築
        // キャラクター設定(system_prompt)とユーザーメッセージを統合
        const contents = [
            { role: "user", parts: [{ text: user_message }] }
            // 💡 ここに会話履歴やユーザー学習情報を追加することで「育成」を実装
        ];

        // 2. Gemini APIの呼び出し (gemini-2.5-flashを使用)
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: contents,
            config: {
                systemInstruction: character_config.system_prompt,
                // temperatureなどのパラメータもここで設定可能
                temperature: 0.9, 
            },
        });

        const bot_response = response.text;

        // 3. 応答の返却
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


/* // 💡 画像生成用のエンドポイント例 (functions/api/image.js などとして別ファイルに)
// ユーザーがプロフィール画像を作成する際に呼び出されます。

export async function onRequestPostImage({ request, env }) {
    // 画像生成APIキーは別キーを使用
    const imageApiKey = env.GEMINI_API_KEY_BH_IMAGE;
    
    if (!imageApiKey) {
        return new Response(JSON.stringify({ error: "Image API Key is missing." }), { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey: imageApiKey });
    const { prompt } = await request.json(); 

    try {
        const response = await ai.models.generateImages({
            model: "imagen-3.0-generate-001", // gemini-2.5-flash-image に対応するモデル
            prompt: prompt,
            config: {
                numberOfImages: 1, 
                aspectRatio: "1:1",
            }
        });

        // 生成された画像のbase64データを返す
        const imageUrl = response.generatedImages[0].image.imageBytes;

        return new Response(JSON.stringify({ imageUrl: imageUrl }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e) {
        // ... エラー処理 ...
    }
}
*/
