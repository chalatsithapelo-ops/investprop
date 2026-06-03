/**
 * Converts a Date object or ISO string to YYYY-MM-DD format for HTML date inputs.
 * 
 * @param date - Date object, ISO string, or null/undefined
 * @returns Date string in YYYY-MM-DD format, or empty string if date is null/undefined
 * 
 * @example
 * dateToFormValue(new Date('2024-03-15T10:30:00Z')) // '2024-03-15'
 * dateToFormValue('2024-03-15T10:30:00Z') // '2024-03-15'
 * dateToFormValue(null) // ''
 */
export function dateToFormValue(date: Date | string | null | undefined): string {
  if (!date) return '';
  
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toISOString().split('T')[0];
  } catch (error) {
    console.error('Error converting date to form value:', error);
    return '';
  }
}

/**
 * Converts a date string from HTML date input (YYYY-MM-DD) to a Date object.
 * 
 * @param formValue - Date string in YYYY-MM-DD format
 * @returns Date object or null if input is empty/invalid
 * 
 * @example
 * formValueToDate('2024-03-15') // Date object for March 15, 2024
 * formValueToDate('') // null
 */
export function formValueToDate(formValue: string | undefined): Date | null {
  if (!formValue) return null;
  
  try {
    return new Date(formValue);
  } catch (error) {
    console.error('Error converting form value to date:', error);
    return null;
  }
}

/**
 * Converts a date string from HTML date input (YYYY-MM-DD) to ISO string format.
 * Useful for API calls that expect ISO date strings.
 * 
 * @param formValue - Date string in YYYY-MM-DD format
 * @returns ISO string or undefined if input is empty/invalid
 * 
 * @example
 * formValueToISOString('2024-03-15') // '2024-03-15T00:00:00.000Z'
 * formValueToISOString('') // undefined
 */
export function formValueToISOString(formValue: string | undefined): string | undefined {
  const date = formValueToDate(formValue);
  return date ? date.toISOString() : undefined;
}

/**
 * Helper for handling optional date fields in forms.
 * Returns the form value if the date exists, undefined otherwise.
 * 
 * @param date - Date object, ISO string, or null/undefined
 * @returns Date string in YYYY-MM-DD format, or undefined
 * 
 * @example
 * dateToOptionalFormValue(new Date()) // '2024-03-15'
 * dateToOptionalFormValue(null) // undefined
 */
export function dateToOptionalFormValue(date: Date | string | null | undefined): string | undefined {
  const formValue = dateToFormValue(date);
  return formValue || undefined;
}
