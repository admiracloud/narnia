export function titleCase(input) {
  input = input.trim().toLowerCase();
  return input.charAt(0).toUpperCase() + input.slice(1);
}