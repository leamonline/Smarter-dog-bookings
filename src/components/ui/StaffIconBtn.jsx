export function StaffIconBtn({ icon, title, onClick }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="bg-transparent border-none w-[26px] h-[26px] flex items-center justify-center cursor-pointer p-0 transition-all rounded hover:opacity-60 hover:scale-[1.12]"
    >
      {icon}
    </button>
  );
}
