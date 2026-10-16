'use client';
export default function ErrorPage({reset}:{reset:()=>void}) { return <main className="fallback-page"><h1>工作台暂时无法显示</h1><p>请重试。不会生成替代金融数据。</p><button className="primary-button" onClick={reset}>重新加载工作台</button></main>; }
