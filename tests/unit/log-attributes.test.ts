import {
    describe,
    expect,
    test,
  } from "vitest";
  
  import {
    normalizeLogAttributes,
  } from "../../src/domain/log-attributes.js";
  
  describe(
    "normalizeLogAttributes",
    () => {
      test(
        "normalizes scalar values to strings",
        () => {
          expect(
            normalizeLogAttributes({
              user_id: "42",
              retries: 3,
              premium: true,
            }),
          ).toEqual({
            user_id: "42",
            retries: "3",
            premium: "true",
          });
        },
      );
  
      test(
        "handles empty attributes",
        () => {
          expect(
            normalizeLogAttributes({}),
          ).toEqual({});
        },
      );
  
      test(
        "preserves unusual keys as data",
        () => {
          const attributes =
            Object.create(null) as Record<
              string,
              string
            >;
  
          Object.defineProperty(
            attributes,
            "__proto__",
            {
              value: "safe",
              enumerable: true,
            },
          );
  
          const result =
            normalizeLogAttributes(
              attributes,
            );
  
          expect(
            Object.prototype.hasOwnProperty.call(
              result,
              "__proto__",
            ),
          ).toBe(true);
  
          expect(
            result["__proto__"],
          ).toBe("safe");
        },
      );
    },
  );