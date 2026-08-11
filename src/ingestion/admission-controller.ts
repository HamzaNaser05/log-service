export type IngestionPermit = {
    release(): void;
  };
  
  export class IngestionAdmissionController {
    private active = 0;
  
    public constructor(
      private readonly maximumInFlight: number,
  
      public readonly retryAfterSeconds: number,
    ) {
      if (
        !Number.isInteger(
          maximumInFlight,
        ) ||
        maximumInFlight < 1
      ) {
        throw new Error(
          "maximumInFlight must be a positive integer",
        );
      }
  
      if (
        !Number.isInteger(
          retryAfterSeconds,
        ) ||
        retryAfterSeconds < 1
      ) {
        throw new Error(
          "retryAfterSeconds must be a positive integer",
        );
      }
    }
  
    public get activeCount(): number {
      return this.active;
    }
  
    public get maxInFlight(): number {
      return this.maximumInFlight;
    }
  
    public tryAcquire():
      IngestionPermit | null {
      if (
        this.active >=
        this.maximumInFlight
      ) {
        return null;
      }
  
      this.active += 1;
  
      let released = false;
  
      return {
        release: () => {
          if (released) {
            return;
          }
  
          released = true;
  
          this.active -= 1;
        },
      };
    }
  }