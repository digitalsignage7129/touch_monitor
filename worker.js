/**
 * ===================================================================
 * 仲介サーバー(Cloudflare Workers)
 * 役割:
 *  - 顧客のブラウザからアップロードされたファイルを受け取る
 *  - GitHubのPersonal Access Token(合鍵)はこのサーバー内だけで保持し、
 *    GitHub Contents API を使って安全にコミットする
 *  - media/ にファイルを追加し、manifest.json を最新化する
 *
 * 必要な環境変数(Cloudflareダッシュボード or wrangler.toml の [vars]/Secrets で設定):
 *  - GITHUB_TOKEN     : リポジトリへの書き込み権限を持つPAT(Secretとして登録)
 *  - GITHUB_OWNER     : GitHubのユーザー名 or 組織名
 *  - GITHUB_REPO      : リポジトリ名(例: construction-signage)
 *  - GITHUB_BRANCH    : 対象ブランチ(例: main)
 *  - UPLOAD_PASSWORD  : 顧客用アップロード画面の簡易パスワード(Secret)
 * ===================================================================
 */

export default {
  async fetch(request, env) {
    // CORS対応(アップロード画面から呼び出せるようにする)
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== "POST") {
      return json({ ok: false, error: "POSTのみ対応しています" }, 405);
    }

    try {
      const formData = await request.formData();
      const password = formData.get("password");
      if (password !== env.UPLOAD_PASSWORD) {
        return json({ ok: false, error: "パスワードが違います" }, 401);
      }

      const file = formData.get("file");
      const label = (formData.get("label") || "").toString().trim();
      const type = (formData.get("type") || "").toString(); // "image" or "video"

      if (!file || !label || !type) {
        return json({ ok: false, error: "ファイル・表示名・種別は必須です" }, 400);
      }

      const arrayBuffer = await file.arrayBuffer();
      const base64Content = arrayBufferToBase64(arrayBuffer);

      const ext = file.name.split(".").pop();
      const id = `item_${Date.now()}`;
      const mediaPath = `media/${id}.${ext}`;

      // 1) メディアファイルをGitHubにコミット
      await githubPutFile(env, mediaPath, base64Content, `add media: ${label}`);

      // 2) manifest.json を取得 → 新しい項目を追加 → 上書きコミット
      const { manifest, sha } = await githubGetManifest(env);
      manifest.items.push({
        id,
        type,
        tag: type === "video" ? "動画" : "写真",
        label,
        icon: mediaPath, // アイコンは当面メディア本体を流用(後で専用アイコン対応も可)
        media: mediaPath,
        updated_at: new Date().toISOString(),
      });
      manifest.version = new Date().toISOString();

      const newManifestContent = btoa(
        unescape(encodeURIComponent(JSON.stringify(manifest, null, 2)))
      );
      await githubPutFile(
        env,
        "manifest.json",
        newManifestContent,
        `update manifest: add ${label}`,
        sha
      );

      return json({ ok: true, message: "アップロードが完了しました" });
    } catch (err) {
      return json({ ok: false, error: err.message || "サーバーエラーが発生しました" }, 500);
    }
  },
};

// ---- GitHub Contents API 呼び出しヘルパー ----

async function githubPutFile(env, path, base64Content, message, sha = null) {
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;
  const body = {
    message,
    content: base64Content,
    branch: env.GITHUB_BRANCH,
  };
  if (sha) body.sha = sha;

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "User-Agent": "signage-upload-worker",
      Accept: "application/vnd.github+json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GitHubへの保存に失敗しました (${path}): ${errText}`);
  }
  return res.json();
}

async function githubGetManifest(env) {
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/manifest.json?ref=${env.GITHUB_BRANCH}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "User-Agent": "signage-upload-worker",
      Accept: "application/vnd.github+json",
    },
  });
  if (!res.ok) throw new Error("manifest.jsonの取得に失敗しました");
  const data = await res.json();
  const decoded = decodeURIComponent(escape(atob(data.content)));
  return { manifest: JSON.parse(decoded), sha: data.sha };
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}
