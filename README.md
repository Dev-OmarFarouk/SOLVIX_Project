# SOLVIX — Space Exploration & Hardware 3D Archive

مستكشف وأرشيف ثلاثي الأبعاد لمهمات ومركبات استكشاف الفضاء (القمر، المريخ، وحزام الكويكبات).
An interactive 3D web archive showcasing space missions, rovers, and planetary orbiters powered by Three.js.

---

## 🚀 التشغيل المباشر على Vercel (Deployment)

المشروع جاهز تماماً للرفع والتشغيل المباشر على **Vercel** بدون الحاجة لأي خادم محلي:
1. ارفع المشروع على حسابك في **GitHub**.
2. ادخل على [Vercel](https://vercel.com) وسجل الدخول بحساب GitHub.
3. اضغط **Add New Project** واختر المستودع (Repository).
4. اضغط **Deploy** مباشرة (لا يحتاج إعدادات بناء Build Settings).
5. سيعمل الموقع مباشرة وتعمل كافة المجسمات ثلاثية الأبعاد (3D Models) والصوتيات والخامات بسلاسة.

---

## 💻 التشغيل المحلي (Local Development)

المتصفحات تمنع تحميل ملفات الـ 3D (.glb) وملفات WebAssembly عبر بروتوكول `file:///` لأسباب أمنية (CORS). لذلك للتشغيل محلياً:

```bash
# تشغيل السيرفر المحلي
node server.js
```
ثم افتح الرابط في المتصفح:
`http://localhost:8080/`

---

## 📁 بنية المشروع (Structure)

- `index.html` / `solvix.html`: واجهة التطبيق التفاعلية.
- `models/`: مجسمات 3D بتنسيق GLB (Apollo Lunar Module, Curiosity, Perseverance, etc.).
- `draco/`: مفكك ضغط Draco لتقليل أحجام النماذج وتسريع تحميلها في المتصفح.
- `textures/`: خامات أسطح الكواكب والتضاريس (Moon & Mars DEM/Color maps).
- `assets/`: التسجيلات الصوتية (عربي وإنجليزي)، الصور والشعارات.
- `js/`: محركات العرض ومكتبات Three.js.
- `vercel.json`: إعدادات التوجيه (Routing) ورؤوس MIME Types و CORS والتخزين المؤقت (Caching) للنماذج ثلاثية الأبعاد.
