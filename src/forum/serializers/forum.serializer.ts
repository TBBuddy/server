import { WithId } from 'mongodb';
import { UserRole } from '../../common/enums/user-role.enum';
import { IUser } from '../../users/user.model';
import { IForumComment } from '../models/forum-comment.model';
import { IForumPost } from '../models/forum-post.model';
import {
  ForumAuthorResponseDto,
  ForumCommentResponseDto,
  ForumPostResponseDto,
} from '../dto/forum-response.dto';

export class ForumSerializer {
  static toAuthor(user: IUser | undefined): ForumAuthorResponseDto {
    return {
      id: user?._id?.toHexString() ?? '',
      username: user?.username ?? 'unknown',
      fullName: user?.full_name ?? null,
      avatarUrl: user?.avatar_url ?? null,
      role: user?.role ?? UserRole.PATIENT,
    };
  }

  static toPostResponse(
    post: WithId<IForumPost>,
    author: ForumAuthorResponseDto,
    isLiked: boolean,
  ): ForumPostResponseDto {
    const isDeleted = post.deleted_at !== null;
    return {
      id: post._id.toHexString(),
      author,
      title: isDeleted ? null : post.title,
      content: isDeleted ? null : post.content,
      imageUrls: isDeleted ? [] : post.image_urls,
      likeCount: post.like_count,
      commentCount: post.comment_count,
      isLiked,
      isDeleted,
      createdAt: post.created_at!.toISOString(),
      updatedAt: post.updated_at!.toISOString(),
      deletedAt: post.deleted_at?.toISOString() ?? null,
    };
  }

  static toCommentResponse(
    comment: WithId<IForumComment>,
    author: ForumAuthorResponseDto,
  ): ForumCommentResponseDto {
    const isDeleted = comment.deleted_at !== null;
    return {
      id: comment._id.toHexString(),
      postId: comment.post_id,
      parentCommentId: comment.parent_comment_id,
      author,
      content: isDeleted ? null : comment.content,
      isDeleted,
      createdAt: comment.created_at!.toISOString(),
      updatedAt: comment.updated_at!.toISOString(),
      deletedAt: comment.deleted_at?.toISOString() ?? null,
    };
  }
}
