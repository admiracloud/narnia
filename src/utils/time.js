export function isValidTimestamp(value) {
  if (!Number.isInteger(value)) return false;

  const date = new Date(value);
  
  return !isNaN(date.getTime()) && date.getTime() === value;
}

export function delay(time) {
  return new Promise(resolve => setTimeout(resolve, time));
}