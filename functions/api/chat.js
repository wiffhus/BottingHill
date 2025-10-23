// functions/api/chat.js
// 「Botting Hillの恋人」 - APIキー自動交代ロジック搭載
// 外部パッケージ（@google/genai）は一切使用していません。

// 6時間ごとのAPIキー自動交代ロジックのための定数
const KEY_COUNT = 4;
// 6時間 = 6 * 60分 * 60秒 * 1000ミリ秒
const ROTATION_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * 現在の時刻に基づいて、使用すべきAPIキーを環境変数から取得します。
 * 環境変数名: GEMINI_API_KEY1, GEMINI_API_KEY2, ...
 * @param {object} env Cloudflare Pages Functionsの環境変数
 * @returns {string} 選択されたAPIキー
 */
function getRotatingApiKey(env) {
    // 固定のエポック（基準日）を設定
    const epoch = new Date('2024-01-01T00:00:00Z').getTime();
    const now = Date.now();
    
    // エポックからの経過時間を6時間のインターバルで割る
    const interval_number = Math.floor((now - epoch) / ROTATION_INTERVAL_MS);
    
    // インターバル番号をキーの数（4）で割った余りでインデックスを決定（0, 1, 2, 3）
    const key_index = interval_number % KEY_COUNT; 
    
    // 環境変数名に変換
    const key_name = `GEMINI_API_KEY${key_index + 1}`;
    
    const selectedKey = env[key_name];

    if (!selectedKey) {
        console.error(`ERROR: API Key '${key_name}' not found.`);
        // 開発者が確認しやすいようにログにエラーを残す
        return null;
    }
    
    console.log(`Using API Key: ${key_name}`);
    return selectedKey;
}

// Cloudflare Pages Functionのエントリーポイント
export async function onRequest(context) {
    const { request, env } = context;
    
    // CORSヘッダーの設定
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };

    // OPTIONSリクエスト(プリフライト)への対応
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
        return new Response('Method not allowed', { 
            status: 405,
            headers: corsHeaders
        });
    }

    try {
        const { message, systemPrompt, history } = await request.json(); 
        
        // 自動交代ロジックでAPIキーを取得
        const API_KEY = getRotatingApiKey(env);
        
        if (!API_KEY) {
            return new Response(JSON.stringify({ error: `Rotating API key not configured correctly.` }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 会話履歴をGemini形式に変換
        const contents = [];

        // システムプロンプトを最初に追加 (Gemini APIの構造に合わせるため、ユーザー側からシステム設定を渡す)
        if (systemPrompt) {
            contents.push({ role: 'user', parts: [{ text: systemPrompt }] });
            contents.push({ role: 'model', parts: [{ text: '承知しました。' }] });
        }

        // historyが存在する場合、履歴を追加
        if (history && history.length > 0) {
            history.forEach(msg => {
                // 'assistant'を'model'に変換
                const role = msg.role === 'user' ? 'user' : 'model';
                contents.push({
                    role: role,
                    parts: [{ text: msg.content }]
                });
            });
        }

        // 最新のメッセージをユーザーの入力として追加
        contents.push({ role: 'user', parts: [{ text: message }] });

        // リクエストペイロードの構築
        const requestBody = {
            contents: contents,
            generationConfig: {
                temperature: 0.9,
                maxOutputTokens: 2048,
            }
        };

        // Gemini APIを呼び出し (gemini-2.5-flashを使用)
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            }
        );

        if (!response.ok) {
            // API側からのエラーメッセージを取得
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Gemini API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || 'エラーが発生しました';

        return new Response(JSON.stringify({ text }), {
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json',
            }
        });

    } catch (error) {
        console.error('Error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}
