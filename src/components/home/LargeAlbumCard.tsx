import { motion } from "framer-motion";
import { Play } from "lucide-react";
import { useNavigate } from "react-router-dom";

export interface LargeAlbum {
  id: string;
  title: string;
  artist: string;
  image: string;
  type?: "album" | "single";
}

interface LargeAlbumCardProps {
  album: LargeAlbum;
  index?: number;
}

export function LargeAlbumCard({ album, index = 0 }: LargeAlbumCardProps) {
  const navigate = useNavigate();
  
  const handleClick = () => {
    const albumId = album.id.startsWith('deezer-') 
      ? album.id.replace('deezer-', '') 
      : album.id;
    navigate(`/album/${albumId}`);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      onClick={handleClick}
      className="group w-40 min-w-[10rem] cursor-pointer"
    >
      <div className="relative mb-3 overflow-hidden rounded-[18px] border border-white/10 bg-background/40 p-1 shadow-[0_12px_30px_rgba(0,0,0,0.18)]">
        <div className="relative aspect-square overflow-hidden rounded-[14px]">
          <img
            src={album.image}
            alt={album.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-transparent" />
          <button className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground opacity-0 shadow-[0_12px_24px_rgba(0,0,0,0.35)] transition-all duration-200 group-hover:opacity-100">
            <Play className="ml-0.5 h-4 w-4 fill-current" />
          </button>
        </div>
      </div>
      <h3 className="truncate text-sm font-bold text-foreground">{album.title}</h3>
      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
        {album.type ? `${album.type.charAt(0).toUpperCase() + album.type.slice(1)} • ` : ""}{album.artist}
      </p>
    </motion.div>
  );
}
