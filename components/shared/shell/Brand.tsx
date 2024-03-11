import app from '@/lib/app';
import Image from 'next/image';
import useTheme from 'hooks/useTheme';

const Brand = () => {
  const { theme } = useTheme();
<<<<<<< HEAD
=======
  console.log(theme);
>>>>>>> 658ba80 (Fix: NavItem not going well with hover)
  return (
    <div className="flex pt-6 shrink-0 items-center text-xl font-bold gap-2 dark:text-gray-100">
      <Image
        className="w-auto"
        src={theme !== 'dark' ? app.logoUrl : '/logowhite.png'}
        alt={app.name}
        width={30}
        height={30}
      />
      {app.name}
    </div>
  );
};

export default Brand;
