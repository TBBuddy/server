import { ValidationError } from 'class-validator';
import { AppException } from '../exceptions/app.exception';
import { ApiErrorDetail } from '../interfaces/api-error.interface';

const constraintCode: Record<string, string> = {
  isDefined: 'IS_DEFINED',
  isEmail: 'IS_EMAIL',
  isEnum: 'IS_ENUM',
  isIn: 'IS_IN',
  isNotEmpty: 'IS_NOT_EMPTY',
  isString: 'IS_STRING',
  isUrl: 'IS_URL',
  matches: 'MATCHES',
  maxLength: 'MAX_LENGTH',
  minLength: 'MIN_LENGTH',
  whitelistValidation: 'UNKNOWN_FIELD',
};

function flattenValidationErrors(
  validationErrors: ValidationError[],
  parentPath = '',
): ApiErrorDetail[] {
  return validationErrors.flatMap((error) => {
    const field = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    const ownErrors = Object.entries(error.constraints ?? {}).map(
      ([constraint, message]) => ({
        field,
        code: constraintCode[constraint] ?? constraint.toUpperCase(),
        message,
      }),
    );

    return [
      ...ownErrors,
      ...flattenValidationErrors(error.children ?? [], field),
    ];
  });
}

export function validationExceptionFactory(
  validationErrors: ValidationError[],
): AppException {
  return new AppException(
    400,
    'VALIDATION_ERROR',
    'Data yang dikirim tidak valid.',
    flattenValidationErrors(validationErrors),
  );
}
