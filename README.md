# UNao Vision – Web nhận diện u não bằng YOLO11

Giao diện chủ đề khủng long T-Rex: khung cảnh động (ngày/đêm, 4 mùa, núi, hồ, cá sấu,
thằn lằn bay làm tổ trên núi) và đàn khủng long tương tác được bằng chuột.

Ứng dụng web (Flask) nhận diện vùng nghi ngờ u não qua **ảnh**, **video** và **camera trực tiếp**
(webcam máy tính hoặc camera điện thoại qua app IP Webcam).

## Cấu trúc thư mục

```
UNao_WebApp/
├── app.py              # Máy chủ web Flask + mô hình YOLO11
├── models/
│   └── best.pt         # Trọng số YOLO11 (có thể thêm file .pt khác)
├── templates/
│   └── index.html      # Giao diện
├── static/
│   ├── style.css       # Định dạng giao diện
│   ├── app.js          # Xử lý giao diện
│   ├── scene.js        # Khung cảnh động + khủng long tương tác
│   ├── author.png      # (tự thêm) ảnh tác giả, không có thì hiện T-Rex
│   ├── uploads/        # Video tải lên
│   └── results/        # Ảnh/video kết quả, ảnh chụp camera
├── requirements.txt    # Thư viện cần cài
└── run.bat             # Chạy nhanh trên Windows
```

## Cách chạy

**Windows:** nhấp đúp `run.bat`. Lần đầu tự cài thư viện (cần Internet, vài phút),
sau đó trình duyệt tự mở trang web.

**Dòng lệnh:**

```
pip install -r requirements.txt
python app.py
```

Mở trình duyệt tại địa chỉ in ra (mặc định http://127.0.0.1:5000). Nhấn `Ctrl + C` để thoát.

## Chức năng

| Mục | Mô tả |
|---|---|
| Qua ảnh | Chọn/kéo thả ảnh MRI → ảnh có khung nhận diện, số vùng u, độ tin cậy, thời gian xử lý; tải ảnh kết quả |
| Qua video | Nhận diện từng khung hình, tiến độ, số khung có u, tin cậy cao nhất; tải video kết quả |
| Camera trực tiếp | Webcam hoặc **camera điện thoại (IP Webcam)**, hiển thị FPS, ms/khung; chụp ảnh kết quả |
| Cài đặt model | Chọn file `.pt` trong `models/`, xem thiết bị (CUDA/CPU) và nhãn của model |
| Ngưỡng tin cậy | Thanh trượt bên phải, áp dụng cho mọi chế độ |
| Ảnh đầu vào | Kích thước ảnh đưa vào model (320–1280) và **zoom camera** (1x–4x) khi đặt camera xa/gần |

## Dùng camera điện thoại

1. Cài app **IP Webcam** (Android) trên điện thoại, mở app → *Start server*.
2. Điện thoại và máy tính dùng **chung mạng Wi-Fi**.
3. Trên web chọn *Camera điện thoại (IP Webcam)*, nhập địa chỉ app hiển thị,
   ví dụ `http://192.168.1.16:8080/video` (nhập `192.168.1.16:8080` cũng được) → *Bắt đầu*.

## Ghi chú

- Có GPU NVIDIA + PyTorch bản CUDA thì tự chạy GPU, không thì chạy CPU.
- Đặt camera **xa**: tăng zoom và/hoặc kích thước ảnh (800–1280).
  Đặt camera **gần**: zoom 1x, kích thước 640 hoặc nhỏ hơn (nhanh hơn).

⚠ Hệ thống thử nghiệm phục vụ học tập và nghiên cứu, không thay thế chẩn đoán của bác sĩ.

## Ảnh tác giả

Ảnh cá nhân không được đưa lên GitHub. Muốn hiện ảnh tác giả, chép ảnh vào
`static/author.png` và sửa tên trong `templates/index.html` (tìm `Tên tác giả`).
