// WordPress REST API クライアント(Application Passwords認証)
// WordPress側: ユーザー > プロフィール > アプリケーションパスワード で発行

export type WordPressPost = {
  id: number;
  link: string;
};

export async function publishToWordPress(input: {
  title: string;
  contentHtml: string;
}): Promise<WordPressPost> {
  const baseUrl = process.env.WORDPRESS_URL;
  const user = process.env.WORDPRESS_USER;
  const appPassword = process.env.WORDPRESS_APP_PASSWORD;
  if (!baseUrl || !user || !appPassword) {
    throw new Error(
      "WORDPRESS_URL / WORDPRESS_USER / WORDPRESS_APP_PASSWORD が設定されていません"
    );
  }

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/wp-json/wp/v2/posts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${user}:${appPassword}`).toString("base64")}`,
    },
    body: JSON.stringify({
      title: input.title,
      content: input.contentHtml,
      status: "publish",
    }),
  });
  if (!res.ok) {
    throw new Error(`WordPress APIエラー: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return { id: data.id, link: data.link };
}
