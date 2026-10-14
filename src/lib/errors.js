export class AppError extends Error {
  constructor(kind, message, cause, code) {
    super(message, cause ? { cause } : undefined);
    this.name = "AppError";
    this.kind = kind;
    this.code = code ?? kind;
  }
}

export function toAppError(error) {
  if (error instanceof AppError) return error;
  return new AppError(
    "NETWORK",
    "学校请求未完成，请检查连接后重试。",
    error,
    "NETWORK",
  );
}
