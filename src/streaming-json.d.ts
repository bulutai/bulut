declare module "streaming-json" {
  export class Lexer {
    constructor();
    reset(): void;
    write(chunk: string): void;
    AppendString(chunk: string): void;
    CompleteJSON(): string;
    readonly values: Record<string, string>;
  }
}
