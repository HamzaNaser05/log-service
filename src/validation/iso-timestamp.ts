export type ParsedIsoTimestamp = {
    value: string;
    epochMilliseconds: number;
  };
  
  export type IsoTimestampParseResult =
    | {
        ok: true;
        value: ParsedIsoTimestamp;
      }
    | {
        ok: false;
        reason: string;
      };
  
  const ISO_TIMESTAMP_PATTERN =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
  
  function isLeapYear(year: number): boolean {
    return (
      year % 400 === 0 ||
      (year % 4 === 0 && year % 100 !== 0)
    );
  }
  
  function daysInMonth(
    year: number,
    month: number,
  ): number {
    switch (month) {
      case 2:
        return isLeapYear(year) ? 29 : 28;
  
      case 4:
      case 6:
      case 9:
      case 11:
        return 30;
  
      default:
        return 31;
    }
  }
  
  export function parseIsoTimestamp(
    value: unknown,
    fieldName: string,
  ): IsoTimestampParseResult {
    if (typeof value !== "string") {
      return {
        ok: false,
        reason:
          `${fieldName} is required and must be a string`,
      };
    }
  
    if (!ISO_TIMESTAMP_PATTERN.test(value)) {
      return {
        ok: false,
        reason:
          `${fieldName} must be a valid ISO 8601 date-time with timezone`,
      };
    }
  
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(5, 7));
    const day = Number(value.slice(8, 10));
    const hour = Number(value.slice(11, 13));
    const minute = Number(value.slice(14, 16));
    const second = Number(value.slice(17, 19));
  
    if (month < 1 || month > 12) {
      return {
        ok: false,
        reason:
          `${fieldName} contains an invalid month`,
      };
    }
  
    const maximumDay = daysInMonth(
      year,
      month,
    );
  
    if (day < 1 || day > maximumDay) {
      return {
        ok: false,
        reason:
          `${fieldName} contains an invalid day`,
      };
    }
  
    if (hour > 23) {
      return {
        ok: false,
        reason:
          `${fieldName} contains an invalid hour`,
      };
    }
  
    if (minute > 59) {
      return {
        ok: false,
        reason:
          `${fieldName} contains an invalid minute`,
      };
    }
  
    if (second > 59) {
      return {
        ok: false,
        reason:
          `${fieldName} contains an invalid second`,
      };
    }
  
    const timezoneStart =
      value.endsWith("Z")
        ? value.length - 1
        : Math.max(
            value.lastIndexOf("+"),
            value.lastIndexOf("-"),
          );
  
    const fractionalStart =
      value.indexOf(".", 19);
  
    const fractionalPart =
      fractionalStart === -1
        ? ""
        : value.slice(
            fractionalStart + 1,
            timezoneStart,
          );
  
    const milliseconds = Number(
      `${fractionalPart}000`.slice(0, 3),
    );
  
    const timezone =
      value.slice(timezoneStart);
  
    let offsetMinutes = 0;
  
    if (timezone !== "Z") {
      const offsetHour = Number(
        timezone.slice(1, 3),
      );
  
      const offsetMinute = Number(
        timezone.slice(4, 6),
      );
  
      if (
        offsetHour > 23 ||
        offsetMinute > 59
      ) {
        return {
          ok: false,
          reason:
            `${fieldName} contains an invalid timezone offset`,
        };
      }
  
      const direction =
        timezone.startsWith("+")
          ? 1
          : -1;
  
      offsetMinutes =
        direction *
        (offsetHour * 60 + offsetMinute);
    }
  
    const localTime = new Date(0);
  
    localTime.setUTCFullYear(
      year,
      month - 1,
      day,
    );
  
    localTime.setUTCHours(
      hour,
      minute,
      second,
      milliseconds,
    );
  
    const epochMilliseconds =
      localTime.getTime() -
      offsetMinutes * 60 * 1000;
  
    return {
      ok: true,
      value: {
        value,
        epochMilliseconds,
      },
    };
  }