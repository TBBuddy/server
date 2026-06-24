import { IMongoloquentSchema, Model } from 'mongoloquent';

export interface IForumComment extends IMongoloquentSchema {
  post_id: string;
  parent_comment_id: string | null;
  author_user_id: string;
  content: string;
  deleted_at: Date | null;
  deleted_by: string | null;
  created_at?: Date;
  updated_at?: Date;
}

export class ForumComment extends Model<IForumComment> {
  public static $schema: IForumComment;
  protected $collection = 'forum_comments';

  constructor() {
    super();
    this.setCreatedAt('created_at');
    this.setUpdatedAt('updated_at');
  }
}
