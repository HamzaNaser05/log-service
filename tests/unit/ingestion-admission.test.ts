import {
    describe,
    expect,
    test,
  } from "vitest";
  
  import {
    IngestionAdmissionController,
  } from "../../src/ingestion/admission-controller.js";
  
  describe(
    "IngestionAdmissionController",
    () => {
      test(
        "bounds concurrent ingestion work",
        () => {
          const controller =
            new IngestionAdmissionController(
              2,
              1,
            );
  
          const first =
            controller
              .tryAcquire();
  
          const second =
            controller
              .tryAcquire();
  
          const third =
            controller
              .tryAcquire();
  
          expect(
            first,
          ).not.toBeNull();
  
          expect(
            second,
          ).not.toBeNull();
  
          expect(
            third,
          ).toBeNull();
  
          expect(
            controller
              .activeCount,
          ).toBe(2);
        },
      );
  
      test(
        "allows new work after a permit is released",
        () => {
          const controller =
            new IngestionAdmissionController(
              1,
              1,
            );
  
          const permit =
            controller
              .tryAcquire();
  
          expect(
            permit,
          ).not.toBeNull();
  
          expect(
            controller
              .tryAcquire(),
          ).toBeNull();
  
          permit?.release();
  
          expect(
            controller
              .activeCount,
          ).toBe(0);
  
          expect(
            controller
              .tryAcquire(),
          ).not.toBeNull();
        },
      );
  
      test(
        "permit release is idempotent",
        () => {
          const controller =
            new IngestionAdmissionController(
              1,
              1,
            );
  
          const permit =
            controller
              .tryAcquire();
  
          if (
            permit === null
          ) {
            throw new Error(
              "Expected permit",
            );
          }
  
          permit.release();
          permit.release();
  
          expect(
            controller
              .activeCount,
          ).toBe(0);
        },
      );
    },
  );