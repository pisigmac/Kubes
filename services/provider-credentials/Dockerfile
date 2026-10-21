FROM golang:1.22-alpine AS build
WORKDIR /src
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /provider-credentials ./cmd/server

FROM alpine:3.21
COPY --from=build /provider-credentials /provider-credentials
RUN addgroup -S -g 65532 app && adduser -S -D -H -u 65532 -G app app
USER 65532:65532
EXPOSE 8081
ENTRYPOINT ["/provider-credentials"]
