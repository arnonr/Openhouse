# ระบบสะสมแสตมป์ดิจิทัลงาน Open House (อุทยานเทคโนโลยี มจพ.)

ระบบสะสมแสตมป์ตามฐานกิจกรรมผ่าน QR Code และ LINE Official Account (`@096ilctj`) สำหรับงาน Open House อุทยานเทคโนโลยี มหาวิทยาลัยเทคโนโลยีพระจอมเกล้าพระนครเหนือ (KMUTNB Techno Park)

---

## จุดเด่นของระบบ
1. **ฝั่งนักเรียน (ไม่น่ารำคาญ รวดเร็วหน้างาน):**
   - เดินมาสแกนป้าย QR Code ประจำฐาน (3–5 ฐาน) ด้วยกล้องมือถือหรือแอป LINE แล้วได้ตราประทับทันที **ไม่ต้องกรอกฟอร์มตอนเริ่ม**
   - ดึงชื่อเล่นและรูปโปรไฟล์จาก LINE อัตโนมัติเมื่อเปิดผ่าน LINE LIFF
   - เมื่อสะสมแสตมป์ครบทุกฐานที่เปิดใช้งาน จึงให้กรอกข้อมูลสั้นๆ แค่ 2 ข้อ (**จิ้มเลือกระดับชั้น** + **พิมพ์ชื่อโรงเรียน**)
   - หน้าแลกรับของรางวัลมี **นาฬิกาเวลาจริงวิ่งตลอดเวลา** (ป้องกันการแคปหน้าจอมาเนียนรับซ้ำ) และกดปุ่มยืนยันรับของรางวัลต่อหน้าสตาฟได้ทันที
2. **ฝั่งเจ้าหน้าที่ (`/admin`):**
   - ดูสถิติแบบเรียลไทม์ (จำนวนผู้เข้าร่วมทั้งหมด, เก็บครบกี่คน, แลกรับรางวัลแล้วกี่คน, ยอดสแกนรายฐาน)
   - เพิ่ม / ลด / แก้ไขชื่อฐานกิจกรรม (3–5 ฐาน) ได้ตลอดเวลาโดยไม่ต้องแก้โค้ด
   - ปุ่ม **"🖨️ พิมพ์ป้าย QR"** จัดหน้ากระดาษขนาด A4 พร้อมชื่อฐานและ QR Code สั่งปริ้นท์ไปติดหน้าฐานได้ทันที
   - ปรับเวลาหน่วงระหว่างการสแกนฐาน (Cooldown ค่าเริ่มต้น 60 วินาที) เพื่อป้องกันเด็กถ่ายรูปป้ายส่งให้เพื่อนกดรัวๆ
   - ปุ่ม **"📥 ดาวน์โหลด Excel (CSV)"** รองรับภาษาไทย 100% (UTF-8 BOM) เปิดใน Microsoft Excel ได้ทันที

---

## วิธีรันทดสอบบนเครื่องของคุณทันที (โหมดจำลอง Demo Mode)

```bash
npm install
npm start
```
- **หน้าจอนักเรียน (พร้อมแถบจำลองกดสแกนแต่ละฐาน):** `http://localhost:3100`
- **หน้าจัดการสำหรับเจ้าหน้าที่ (Admin):** `http://localhost:3100/admin` (รหัสผ่านเริ่มต้น: `technopark2026`)
- **หน้าพิมพ์ป้าย QR ขนาด A4:** `http://localhost:3100/poster.html?code=ST-01-ROBOT`

---

## ขั้นตอนที่ 1: การนำขึ้น Ubuntu Server และตั้งค่า Nginx Proxy Manager

1. คัดลอกโฟลเดอร์โปรเจกต์นี้ขึ้นไปยัง Ubuntu Server ของหน่วยงาน
2. สร้างไฟล์ `.env` จาก `.env.example` แล้วกำหนดรหัสผ่าน Admin:
   ```bash
   cp .env.example .env
   nano .env
   ```
   ตัวอย่างค่าใน `.env`:
   ```env
   PORT=3100
   ADMIN_PASSWORD=ตั้งรหัสผ่านของทีมงาน
   LIFF_ID=
   LINE_OA_ID=@096ilctj
   PUBLIC_BASE_URL=https://openhouse.technopark.kmutnb.ac.th
   ```
3. สั่งรันผ่าน Docker Compose:
   ```bash
   docker compose up -d --build
   ```
   *(ข้อมูลฐานข้อมูล SQLite ทั้งหมดจะถูกเก็บไว้ในโฟลเดอร์ `./data/openhouse.db` บนเครื่องเซิร์ฟเวอร์อย่างปลอดภัย)*
4. ตั้งค่าใน **Nginx Proxy Manager**:
   - **แบบซับโดเมน (แนะนำ):** สร้าง Proxy Host ใหม่ เช่น `openhouse.technopark.kmutnb.ac.th` ชี้ไปที่ IP ของเซิร์ฟเวอร์ พอร์ต `3100` และเปิดแท็บ **SSL** เลือก Request a new SSL Certificate (Force SSL)
   - หรือหากใช้โดเมน `https://it.technopark.kmutnb.ac.th/` อยู่แล้ว สามารถชี้ซับโดเมนย่อยมายังพอร์ต `3100` ได้เช่นกัน

---

## ขั้นตอนที่ 2: การผูกกับ LINE OA ของหน่วยงาน (`@096ilctj`)

เพื่อให้ระบบดึงชื่อและรูปโปรไฟล์จาก LINE ของนักเรียนอัตโนมัติ และชวนกดเพิ่มเพื่อน LINE OA (`@096ilctj`):

1. เข้าไปที่ [LINE Developers Console](https://developers.line.biz/console/) ด้วยบัญชีที่ดูแล `@096ilctj`
2. สร้าง **Provider** (หรือเลือกของหน่วยงานที่มีอยู่) -> สร้าง Channel ประเภท **LINE Login**
3. ในหน้าตั้งค่า LINE Login Channel:
   - หัวข้อ **Linked OA**: เลือกผูกกับบัญชี `@096ilctj`
   - แท็บ **LIFF** -> กด **Add** เพื่อสร้าง LIFF App:
     - **LIFF app name:** `Open House Stamp Rally`
     - **Size:** `Full`
     - **Endpoint URL:** ใส่ลิงก์ HTTPS ของเซิร์ฟเวอร์ (เช่น `https://openhouse.technopark.kmutnb.ac.th`)
     - **Scopes:** ติ๊ก `profile` และ `openid`
     - **Add friend option:** เลือก `On (Aggressive)` หรือ `On (Normal)` เพื่อให้ระบบชวนนักเรียนกดแอดเพื่อน LINE OA `@096ilctj` ทันทีที่สแกนเข้าฐานแรก!
4. คัดลอกค่า **LIFF ID** (เช่น `2006xxxxxx-xxxxxxxx`) มาใส่ในไฟล์ `.env` บนเซิร์ฟเวอร์:
   ```env
   LIFF_ID=2006xxxxxx-xxxxxxxx
   ```
   แล้วรัน `docker compose up -d` อีกครั้ง (เมื่อใส่ `LIFF_ID` แล้ว แถบ Demo Mode สีดำด้านล่างจะซ่อนอัตโนมัติ และใบป้าย QR Code ในหน้า Admin จะเปลี่ยนเป็นลิงก์ `https://liff.line.me/<LIFF_ID>?booth=...` โดยอัตโนมัติ)
5. **(ทางเลือกเสริม) เพิ่มปุ่มใน Rich Menu ของ LINE OA Manager:**
   - เข้าไปที่ [LINE Official Account Manager (@096ilctj)](https://manager.line.biz/account/@096ilctj) -> เมนู **ริชเมนู (Rich Menu)**
   - ตั้งค่าปุ่มเป็นประเภท **ลิงก์ (Link)** แล้ววางลิงก์ `https://liff.line.me/<LIFF_ID>` เพื่อให้นักเรียนกดเปิดดูบัตรสะสมแสตมป์ของตัวเองจากในห้องแชท LINE OA ได้ตลอดเวลา
