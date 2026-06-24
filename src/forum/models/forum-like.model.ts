import { IMongoloquentSchema, Model } from 'mongoloquent';

export interface IForumLike extends IMongoloquentSchema {
  post_id: string;
  user_id: string;
  created_at?: Date;
}

export class ForumLike extends Model<IForumLike> {
  public static $schema: IForumLike;
  protected $collection = 'forum_likes';

  constructor() {
    super();
    this.setCreatedAt('created_at');
  }
}
