import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title:'AI StockLens · 看清选股依据',description:'以可检查的条件和真实金融数据进行股票筛选与研究。当前仅覆盖三只演示股票。' };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="zh-CN"><body>{children}</body></html>; }
