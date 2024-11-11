import { chromium, Page } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// 環境変数の読み込み
dotenv.config();

// Supabaseの設定
const supabaseUrl = 'https://qbwnzhjhsfsrcrtwhmqj.supabase.co';
const supabaseKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFid256aGpoc2ZzcmNydHdobXFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mjg1MTk4MDQsImV4cCI6MjA0NDA5NTgwNH0.pxbPljGNhCCpeJihornhTSvy0MIHd16hT7k6D_HIMFA';
const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
  // ブラウザの起動
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // 検索ページにアクセス
  await page.goto('https://houjin.jp/search');

  let hasNextPage = true;

  // 業種リストの定義
  const industryList = [
    '農林水産・鉱業',
    '建設',
    'メーカー',
    '食料品',
    '繊維',
    'パルプ・紙',
    '化学',
    '石油・石炭製品',
    'ゴム製品',
    '鉄鋼',
    '非鉄金属',
    '金属製品',
    '機械',
    '精密機器',
    '電気機器',
    '輸送用機器',
    '電力・ガス・水道・エネルギー関連',
    '情報・通信',
    '運輸・倉庫関連',
    '陸運業',
    '海運業',
    '空運業',
    '倉庫業',
    '商社',
    '小売',
    '金融・保険',
    '銀行',
    '保険',
    '不動産、レンタル・リース',
    '教育・研究',
    'サービス',
    '宿泊',
    '飲食',
    '理容・美容・エステティック',
    'レジャー・アミューズメント・スポーツ施設',
    '医療・福祉',
    '公社・団体・官公庁',
    '宗教',
    'その他',
  ];

  // 業種リストを長さの降順でソート
  industryList.sort((a, b) => b.length - a.length);

  while (hasNextPage) {
    // 広告を閉じる
    await closeAds(page);

    // 検索結果のリストから各法人の詳細ページへのリンクを取得
    const detailLinks = await page.$$eval('a', (links) =>
      links
        .filter((link) => link.textContent?.startsWith('法人番号：'))
        .map((link) => link.href)
    );

    // 各詳細ページからデータを抽出
    for (const link of detailLinks) {
      await page.goto(link);

      // 法人ページの広告を閉じる
      await closeAds(page);

      // データの抽出
      const data = await page.evaluate((industryList) => {
        const getText = (selector: string): string | null => {
          const element = document.querySelector(selector);
          return element?.textContent?.trim() || null;
        };

        const getHref = (selector: string): string | null => {
          const element = document.querySelector(selector);
          return element instanceof HTMLAnchorElement ? element.href : null;
        };

        // 法人番号
        const companyNumber = getText('table tr:nth-child(1) td');
        // 法人名
        const companyName = getText('table tr:nth-child(2) td');
        // フリガナ
        const companyNameKana = getText('table tr:nth-child(3) td');
        // 法人名（英語）
        const companyNameEnglish = getText('table tr:nth-child(4) td');
        // 住所/地図
        const companyAddress = getText('table tr:nth-child(5) td');
        // 住所（英語）
        const companyAddressEnglish = getText('table tr:nth-child(6) td');
        // 社長/代表者
        const representativeName = getText('table tr:nth-child(7) td');
        // URL
        const homePage = getHref('table tr:nth-child(8) td a');
        // 電話番号
        const tel = getText('table tr:nth-child(9) td');
        // 設立
        const establishment = getText('table tr:nth-child(10) td');
        // 業種
        const industryRaw = getText('table tr:nth-child(11) td');

        let industries: string[] = [];

        if (industryRaw) {
          let industriesFound: { industry: string; position: number }[] = [];

          for (const industry of industryList) {
            const position = industryRaw.indexOf(industry);
            if (position >= 0) {
              industriesFound.push({ industry, position });
            }
          }

          // 重複を削除
          industriesFound = industriesFound.filter(
            (item, index, self) =>
              index === self.findIndex((t) => t.industry === item.industry)
          );

          // 出現位置でソート
          industriesFound.sort((a, b) => a.position - b.position);

          // 業種のみを抽出
          industries = industriesFound.map((item) => item.industry);
        }

        return {
          companyNumber,
          companyName,
          companyNameKana,
          companyNameEnglish,
          companyAddress,
          companyAddressEnglish,
          representativeName,
          homePage,
          tel,
          establishment,
          industries,
        };
      }, industryList);

      // データの確認
      console.log(data);

      // Supabaseにデータを保存
      const { error } = await supabase.from('houjinserch').insert([
        {
          companynumber: data.companyNumber,
          companyname: data.companyName,
          companynamekana: data.companyNameKana,
          companynameenglish: data.companyNameEnglish,
          companyaddress: data.companyAddress,
          companyaddressenglish: data.companyAddressEnglish,
          representativename: data.representativeName,
          homepage: data.homePage,
          tel: data.tel,
          establishment: data.establishment,
          industry1: data.industries[0] || null,
          industry2: data.industries[1] || null,
          industry3: data.industries[2] || null,
          industry4: data.industries[3] || null,
        },
      ]);

      if (error) {
        console.error('データの保存中にエラーが発生しました:', error);
      } else {
        console.log('データが正常に保存されました');
      }

      // 前のページに戻る
      await page.goBack();
    }

    // 次のページへの移動
    try {
      const nextPageLink = await page.$('a:has-text("次のページへ")');
      if (nextPageLink) {
        await nextPageLink.click();
        console.log('次のページに移動しました');
        await page.waitForLoadState('domcontentloaded');
      } else {
        hasNextPage = false;
        console.log('これ以上のページはありません');
      }
    } catch (error) {
      hasNextPage = false;
      console.log('次のページへの移動中にエラーが発生しましたが、処理を終了します');
    }
  }

  await browser.close();
})();

// 広告を閉じる関数
async function closeAds(page: Page) {
  try {
    // すべてのiframeを取得
    const frames = page.frames();

    for (const frame of frames) {
      // 広告の閉じるボタンを探す
      const closeButton = await frame.$(
        'div[aria-label="閉じる"], div[aria-label="Close"], button[aria-label="閉じる"], button[aria-label="Close"]'
      );

      if (closeButton) {
        await closeButton.click();
        console.log('広告を閉じました');
      }
    }
  } catch (error) {
    console.log('広告を閉じる処理でエラーが発生しましたが、続行します');
  }
}
