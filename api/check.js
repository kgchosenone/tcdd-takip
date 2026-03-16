// api/check.js - Vercel Serverless Function
// TCDD sefer sorgulama proxy'si

export default async function handler(req, res) {
  // CORS başlıkları — tüm origin'lere izin ver
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Sadece POST destekleniyor' });
  }

  const { from, to, date } = req.body;

  if (!from || !to || !date) {
    return res.status(400).json({ error: 'from, to, date zorunlu' });
  }

  try {
    // TCDD'nin kendi sitesinin kullandığı endpoint
    const tcddUrl = 'https://api-yolcu.tcdd.gov.tr/api/seferler';

    const payload = {
      binisIstasyonId: from,
      inisIstasyonId: to,
      gidisTarihi: date, // format: "2026-03-20"
      yetiskinSayisi: 1,
      cocukSayisi: 0,
      bebekSayisi: 0
    };

    const response = await fetch(tcddUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
        'Referer': 'https://bilet.tcdd.gov.tr/',
        'Origin': 'https://bilet.tcdd.gov.tr'
      },
      body: JSON.stringify(payload),
      // 10 saniye timeout
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      return res.status(502).json({
        error: `TCDD API hatası: ${response.status}`,
        available: false
      });
    }

    const data = await response.json();

    // Müsait koltuk var mı kontrol et
    // TCDD API'si seferler dizisi döndürür, her sefer musaitKoltukSayisi içerir
    const seferler = data?.seferSorgulamaList || data?.seferler || [];

    const musaitSeferler = seferler.filter(s => {
      const koltuk = s.musaitKoltukSayisi ?? s.bosKoltukSayisi ?? 0;
      return koltuk > 0;
    }).map(s => ({
      seferAdi: s.trenAdi || s.seferNo || 'YHT',
      kalkisSaati: s.gidisSaati || s.kalkisSaati || '',
      varisSaati: s.varisSaati || '',
      bosKoltuk: s.musaitKoltukSayisi ?? s.bosKoltukSayisi ?? 0,
      fiyat: s.enDusukFiyat || s.fiyat || null
    }));

    return res.status(200).json({
      available: musaitSeferler.length > 0,
      seferler: musaitSeferler,
      toplamSefer: seferler.length,
      sorguZamani: new Date().toISOString()
    });

  } catch (err) {
    console.error('TCDD proxy hatası:', err.message);
    return res.status(500).json({
      error: 'Sorgu başarısız: ' + err.message,
      available: false
    });
  }
}
