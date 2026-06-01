<script>
export default {
  onLaunch: function () {
    console.log('App Launch')
  },
  onShow: function () {
    console.log('App Show')
  },
  onHide: function () {
    console.log('App Hide')
  },
}
</script>

<style>
/* 全局样式 — iOS 26 Liquid Glass */
page {
  height: 100%;
  overflow: hidden;
  background-color: #FBF7F0;
}

view, text, input, button, scroll-view {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

/* CSS 变量 — 薄荷绿 + 米色 */
:root {
  --bg: #FBF7F0;
  --card-bg: rgba(255, 255, 255, 0.72);
  --glass-bg: rgba(255, 255, 255, 0.55);
  --text-primary: #2D2D2A;
  --text-secondary: #7A7A72;
  --text-muted: #B5B0A6;
  --expense: #E8856D;
  --expense-bg: rgba(232, 133, 109, 0.12);
  --income: #73C7A8;
  --income-bg: rgba(115, 199, 168, 0.12);
  --border: rgba(0, 0, 0, 0.06);
  --input-bg: rgba(248, 244, 237, 0.8);
  --input-border: rgba(0, 0, 0, 0.08);
  --accent: #73C7A8;
  --accent-dark: #5BAF8E;
  --accent-light: rgba(115, 199, 168, 0.15);
  --accent-glow: rgba(115, 199, 168, 0.25);
  --shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
  --blur: saturate(180%) blur(20px);
}
</style>