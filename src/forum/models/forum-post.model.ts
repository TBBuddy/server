import { IMongoloquentSchema, Model } from 'mongoloquent';

export interface IForumPost extends IMongoloquentSchema {
  author_user_id: string;
  title: string;
  content: string;
  image_urls: string[];
  like_count: number;
  comment_count: number;
  deleted_at: Date | null;
  deleted_by: string | null;
  created_at?: Date;
  updated_at?: Date;
}

export class ForumPost extends Model<IForumPost> {
  public static $schema: IForumPost;
  protected $collection = 'forum_posts';

  constructor() {
    super();
    this.setCreatedAt('created_at');
    this.setUpdatedAt('updated_at');
  }
}
