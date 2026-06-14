// ページに「コマ絵化」ボタンを Shadow DOM で注入する。ホストページの CSS と衝突させない。

const HOST_ID = 'novel-theater-launcher';

export function mountLauncher(onClick: () => void): void {
  if (document.getElementById(HOST_ID)) return;

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.position = 'fixed';
  host.style.right = '16px';
  host.style.bottom = '16px';
  host.style.zIndex = '2147483647';
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    .btn {
      font-family: system-ui, sans-serif;
      font-size: 14px;
      font-weight: 600;
      color: #fff;
      background: linear-gradient(135deg, #6d5dfc, #c44bd8);
      border: none;
      border-radius: 999px;
      padding: 10px 18px;
      box-shadow: 0 4px 14px rgba(0,0,0,.25);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .btn:hover { filter: brightness(1.08); }
    .btn:disabled { opacity: .6; cursor: default; }
  `;
  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.textContent = '🎬 コマ絵化';
  btn.addEventListener('click', onClick);

  shadow.append(style, btn);
}

export function removeLauncher(): void {
  document.getElementById(HOST_ID)?.remove();
}

export function setLauncherBusy(busy: boolean): void {
  const host = document.getElementById(HOST_ID);
  const btn = host?.shadowRoot?.querySelector<HTMLButtonElement>('.btn');
  if (btn) {
    btn.disabled = busy;
    btn.textContent = busy ? '⏳ 生成中…' : '🎬 コマ絵化';
  }
}
