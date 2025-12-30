export interface OBFImage {
  id: string;
  data?: string;
  url?: string;
  content_type?: string;
  width?: number;
  height?: number;
  ext_grid3_entry?: string;
  ext_snap_identifier?: string;
  [key: string]: any;
}

export interface OBFSound {
  id: string;
  data?: string;
  url?: string;
  content_type?: string;
  [key: string]: any;
}

export interface OBFButton {
  id: string;
  label?: string;
  vocalization?: string;
  image_id?: string;
  sound_id?: string;
  hidden?: boolean;
  action?: string;
  actions?: string[];
  background_color?: string;
  border_color?: string;
  load_board?: {
    id?: string;
    path?: string;
    url?: string;
  };
  style?: {
    background_color?: string;
    border_color?: string;
    font_color?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

export interface OBFPage {
  id: string;
  name?: string;
  locale?: string;
  format: string;
  grid?: {
    rows: number;
    columns: number;
    order: (string | null)[][];
  };
  buttons: OBFButton[];
  images: OBFImage[];
  sounds: OBFSound[];
  style?: {
    background_color?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

export interface OBZPackage {
  format: string;
  boards: OBFPage[];
  images: OBFImage[];
  sounds: OBFSound[];
  [key: string]: any;
}
