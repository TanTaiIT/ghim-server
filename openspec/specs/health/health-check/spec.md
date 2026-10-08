# health/health-check Specification

## Purpose

Cho hạ tầng chạy app biết hai điều tách biệt: tiến trình còn sống không (để khởi động lại khi chết), và
đã sẵn sàng nhận traffic chưa (để ngừng đẩy request khi DB không dùng được).

## Requirements

### Requirement: Liveness

`GET /health` SHALL trả HTTP 200 với `status: "ok"`, tên app, môi trường, thời gian chạy và thời điểm, mà
không chạm DB.

#### Scenario: Tiến trình đang chạy

- **WHEN** client gọi `GET /health`
- **THEN** response có HTTP 200 và `data.status` là `"ok"`

#### Scenario: DB đang không dùng được

- **WHEN** DB không nối được và client gọi `GET /health`
- **THEN** response vẫn có HTTP 200 — tiến trình còn sống thì không bị khởi động lại vì DB

### Requirement: Readiness

`GET /health/ready` SHALL kiểm DB thật và trả HTTP 200 với `database: "up"` khi nối được, HTTP 503 với
`database: "down"` khi không.

#### Scenario: DB sẵn sàng

- **WHEN** DB nối được và client gọi `GET /health/ready`
- **THEN** response có HTTP 200 và `data.database` là `"up"`

#### Scenario: DB không nối được

- **WHEN** DB không nối được và client gọi `GET /health/ready`
- **THEN** response có HTTP 503 và `data.database` là `"down"`
