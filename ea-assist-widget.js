/**
 * EA-Assist 問い合わせ削減AIチャットボット 埋め込みウィジェット（P1 β）
 *
 * 設置方法: EC(MakeShop フリーページ等)に次の1行を貼るだけ
 *   <script src="https://<github-pages>/ea-assist-widget.js" defer></script>
 *
 * 制約準拠: 外部CDN不使用・システムフォント・自己完結（CSSもJSで注入）。
 * ブランド: Earthy Organics パレット（brand.md 準拠）。
 * 通信: GAS Web App へ text/plain で POST（CORS プリフライト回避）。APIキーはサーバ側のみ。
 */
(function () {
  'use strict';

  // ===== 設定（デプロイ後に GAS Web App の /exec URL を設定）=====
  var API_URL = 'https://script.google.com/macros/s/AKfycbyLrCQiHiB80Te8wU5cOBETnAL1IjPkb7PxM-3bDd6iaD7bNO-R8-voASD0QjnVU6lW1g/exec';
  var CONTACT_EMAIL = 'contact@earthyorganics.jp';
  var PRIVACY_URL = 'https://www.earthyorganics.jp/view/policy';
  var BRAND = {
    bg: '#F9F6F1', orange: '#E99658', turquoise: '#5EC4B3',
    sand: '#D7C4A3', text: '#4A4A4A', textLight: '#7A7A7A', white: '#FFFFFF'
  };
  var FONT = '"Yu Gothic", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif';
  var GREETING = 'こんにちは。配送・お支払い・返品など、よくあるご質問にAIがお答えします。\n※ 氏名・住所・電話番号・注文番号などの個人情報は入力しないでください。';

  // ページ内で1回だけ生成するセッションID（会話ログの識別用・個人情報は含めない）
  var SESSION_ID = 's' + Date.now() + Math.floor(Math.random() * 1e6);

  // ===== スタイル注入 =====
  function injectStyle() {
    var css = [
      '.eaa-btn{position:fixed;right:20px;bottom:20px;width:60px;height:60px;border-radius:50%;',
      'background:' + BRAND.orange + ';color:#fff;border:none;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.2);',
      'font-family:' + FONT + ';font-size:13px;line-height:1.2;z-index:2147483000;}',
      '.eaa-panel{position:fixed;right:20px;bottom:92px;width:340px;max-width:calc(100vw - 40px);height:480px;',
      'max-height:calc(100vh - 120px);background:' + BRAND.bg + ';border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.25);',
      'display:none;flex-direction:column;overflow:hidden;z-index:2147483000;font-family:' + FONT + ';color:' + BRAND.text + ';}',
      '.eaa-panel.eaa-open{display:flex;}',
      '.eaa-head{background:' + BRAND.orange + ';color:#fff;padding:14px 16px;font-size:15px;font-weight:bold;display:flex;justify-content:space-between;align-items:center;}',
      '.eaa-head .eaa-x{background:none;border:none;color:#fff;font-size:20px;cursor:pointer;line-height:1;}',
      '.eaa-body{flex:1;overflow-y:auto;padding:14px;}',
      '.eaa-msg{margin-bottom:12px;display:flex;}',
      '.eaa-msg.eaa-user{justify-content:flex-end;}',
      '.eaa-bubble{max-width:80%;padding:10px 12px;border-radius:12px;font-size:14px;line-height:1.6;white-space:pre-wrap;word-break:break-word;}',
      '.eaa-ai .eaa-bubble{background:#fff;border:1px solid ' + BRAND.sand + ';}',
      '.eaa-user .eaa-bubble{background:' + BRAND.turquoise + ';color:#fff;}',
      '.eaa-foot{border-top:1px solid ' + BRAND.sand + ';padding:10px;display:flex;gap:8px;background:' + BRAND.bg + ';}',
      '.eaa-input{flex:1;border:1px solid ' + BRAND.sand + ';border-radius:20px;padding:9px 14px;font-size:14px;font-family:' + FONT + ';outline:none;}',
      '.eaa-send{background:' + BRAND.orange + ';color:#fff;border:none;border-radius:20px;padding:0 16px;cursor:pointer;font-size:14px;}',
      '.eaa-send:disabled{opacity:.5;cursor:default;}',
      '.eaa-note{font-size:11px;color:' + BRAND.textLight + ';padding:0 14px 8px;text-align:center;}',
      '.eaa-link{color:' + BRAND.orange + ';text-decoration:underline;}',
      '.eaa-typing{font-size:13px;color:' + BRAND.textLight + ';}'
    ].join('');
    var s = document.createElement('style');
    s.type = 'text/css';
    s.appendChild(document.createTextNode(css));
    document.head.appendChild(s);
  }

  // ===== DOM 構築 =====
  var panel, body, input, sendBtn;

  function build() {
    var btn = document.createElement('button');
    btn.className = 'eaa-btn';
    btn.setAttribute('aria-label', 'よくある質問AIを開く');
    btn.textContent = 'ご質問';
    btn.onclick = togglePanel;
    document.body.appendChild(btn);

    panel = document.createElement('div');
    panel.className = 'eaa-panel';
    panel.innerHTML =
      '<div class="eaa-head"><span>よくあるご質問 AI</span><button class="eaa-x" aria-label="閉じる">&times;</button></div>' +
      '<div class="eaa-body"></div>' +
      '<div class="eaa-note">AIが回答します。個別のご注文状況・在庫はお調べできません。<br>' +
      '会話内容は品質改善のため記録され、AI（Google Gemini）で処理されます。' +
      '<a class="eaa-link" href="' + PRIVACY_URL + '" target="_blank" rel="noopener">プライバシーポリシー</a></div>' +
      '<div class="eaa-foot"><input class="eaa-input" type="text" placeholder="ご質問を入力" maxlength="200"/>' +
      '<button class="eaa-send">送信</button></div>';
    document.body.appendChild(panel);

    body = panel.querySelector('.eaa-body');
    input = panel.querySelector('.eaa-input');
    sendBtn = panel.querySelector('.eaa-send');
    panel.querySelector('.eaa-x').onclick = togglePanel;
    sendBtn.onclick = send;
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });

    addMsg('ai', GREETING);
  }

  function togglePanel() {
    panel.classList.toggle('eaa-open');
    if (panel.classList.contains('eaa-open')) { input.focus(); }
  }

  function addMsg(role, text, isHtml) {
    var wrap = document.createElement('div');
    wrap.className = 'eaa-msg ' + (role === 'user' ? 'eaa-user' : 'eaa-ai');
    var bubble = document.createElement('div');
    bubble.className = 'eaa-bubble';
    if (isHtml) { bubble.innerHTML = text; } else { bubble.textContent = text; }
    wrap.appendChild(bubble);
    body.appendChild(wrap);
    body.scrollTop = body.scrollHeight;
    return bubble;
  }

  function setBusy(b) {
    sendBtn.disabled = b;
    input.disabled = b;
  }

  // ===== 送信・API 呼び出し =====
  function send() {
    var q = (input.value || '').trim();
    if (!q) { return; }
    addMsg('user', q);
    input.value = '';
    setBusy(true);
    var typing = addMsg('ai', '入力中…');
    typing.parentNode.classList.add('eaa-typing');

    // text/plain で送信し CORS プリフライトを避ける
    fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ question: q, sessionId: SESSION_ID })
    }).then(function (r) { return r.json(); }).then(function (res) {
      typing.parentNode.parentNode.removeChild(typing.parentNode);
      if (res && res.answer) {
        addMsg('ai', res.answer);
        if (res.escalate) { appendContact(); }
      } else {
        addMsg('ai', 'うまくお答えできませんでした。');
        appendContact();
      }
    }).catch(function () {
      typing.parentNode.parentNode.removeChild(typing.parentNode);
      addMsg('ai', '通信エラーが発生しました。時間をおいて再度お試しください。');
      appendContact();
    }).then(function () { setBusy(false); input.focus(); });
  }

  function appendContact() {
    // innerHTML を使わず DOM 生成（XSS 面を残さない・Walter O-1）
    var bubble = addMsg('ai', 'お手数ですが、こちらまでお問い合わせください: ');
    var a = document.createElement('a');
    a.className = 'eaa-link';
    a.href = 'mailto:' + CONTACT_EMAIL;
    a.textContent = CONTACT_EMAIL;
    bubble.appendChild(a);
  }

  // ===== 起動 =====
  function boot() { injectStyle(); build(); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }
})();
