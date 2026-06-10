export function Eye({ size = 32 }: { size?: number }) {
  return (
    <svg className="eye" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <ellipse cx="24" cy="24" rx="21" ry="13" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle className="eye-iris" cx="24" cy="24" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle className="eye-pupil" cx="24" cy="24" r="3.5" fill="currentColor" />
    </svg>
  );
}
