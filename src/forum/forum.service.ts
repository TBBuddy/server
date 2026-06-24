import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@mongoloquent/nestjs';
import {
  Collection,
  Filter,
  MongoServerError,
  ObjectId,
  Sort,
  WithId,
} from 'mongodb';
import { Database } from 'mongoloquent';
import { AppException } from '../common/exceptions/app.exception';
import { IUser } from '../users/user.model';
import { CreateForumCommentDto } from './dto/create-forum-comment.dto';
import { CreateForumPostDto } from './dto/create-forum-post.dto';
import {
  ForumCommentResponseDto,
  ForumPostResponseDto,
} from './dto/forum-response.dto';
import { ListForumCommentsQueryDto } from './dto/list-forum-comments-query.dto';
import { ListForumPostsQueryDto } from './dto/list-forum-posts-query.dto';
import { UpdateForumCommentDto } from './dto/update-forum-comment.dto';
import { UpdateForumPostDto } from './dto/update-forum-post.dto';
import { ForumComment, IForumComment } from './models/forum-comment.model';
import { ForumLike, IForumLike } from './models/forum-like.model';
import { ForumPost, IForumPost } from './models/forum-post.model';
import { ForumSerializer } from './serializers/forum.serializer';

interface PaginatedForumPosts {
  posts: ForumPostResponseDto[];
  total: number;
}

interface PaginatedForumComments {
  comments: ForumCommentResponseDto[];
  total: number;
}

@Injectable()
export class ForumService implements OnApplicationBootstrap {
  constructor(
    @InjectModel(ForumPost)
    private readonly postModel: typeof ForumPost,
    @InjectModel(ForumComment)
    private readonly commentModel: typeof ForumComment,
    @InjectModel(ForumLike)
    private readonly likeModel: typeof ForumLike,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await Promise.all([
      this.posts().createIndexes([
        {
          key: { deleted_at: 1, created_at: -1 },
          name: 'forum_posts_latest',
        },
        {
          key: {
            deleted_at: 1,
            like_count: -1,
            comment_count: -1,
            created_at: -1,
          },
          name: 'forum_posts_hot',
        },
        {
          key: { author_user_id: 1, created_at: -1 },
          name: 'forum_posts_author_created',
        },
      ]),
      this.comments().createIndexes([
        {
          key: { post_id: 1, created_at: 1 },
          name: 'forum_comments_post_created',
        },
        {
          key: { parent_comment_id: 1, created_at: 1 },
          name: 'forum_comments_parent_created',
        },
        {
          key: { author_user_id: 1, created_at: -1 },
          name: 'forum_comments_author_created',
        },
      ]),
      this.likes().createIndexes([
        {
          key: { post_id: 1, user_id: 1 },
          name: 'forum_likes_post_user_unique',
          unique: true,
        },
        {
          key: { user_id: 1, post_id: 1 },
          name: 'forum_likes_user_post',
        },
      ]),
    ]);
  }

  async createPost(userId: string, dto: CreateForumPostDto): Promise<void> {
    const now = new Date();
    await this.posts().insertOne({
      _id: new ObjectId(),
      author_user_id: userId,
      title: dto.title,
      content: dto.content,
      image_urls: dto.imageUrls ?? [],
      like_count: 0,
      comment_count: 0,
      deleted_at: null,
      deleted_by: null,
      created_at: now,
      updated_at: now,
    });
  }

  async listPosts(
    userId: string,
    query: ListForumPostsQueryDto,
  ): Promise<PaginatedForumPosts> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter: Filter<IForumPost> = { deleted_at: null };
    const sort = this.postSort(query.sort ?? 'latest');

    const [posts, total] = await Promise.all([
      this.posts()
        .find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      this.posts().countDocuments(filter),
    ]);

    return {
      posts: await this.serializePosts(posts, userId),
      total,
    };
  }

  async findPost(
    userId: string,
    postId: string,
  ): Promise<ForumPostResponseDto> {
    const post = await this.requirePost(postId);
    const [response] = await this.serializePosts([post], userId);
    return response;
  }

  async updatePost(
    userId: string,
    postId: string,
    dto: UpdateForumPostDto,
  ): Promise<void> {
    if (
      dto.title === undefined &&
      dto.content === undefined &&
      dto.imageUrls === undefined
    ) {
      throw new AppException(
        400,
        'BUSINESS_RULE_VIOLATION',
        'Minimal satu field post harus dikirim.',
      );
    }

    const post = await this.requireOwnedPost(userId, postId);
    this.assertPostEditable(post);

    const changes: Partial<IForumPost> = { updated_at: new Date() };
    if (dto.title !== undefined) changes.title = dto.title;
    if (dto.content !== undefined) changes.content = dto.content;
    if (dto.imageUrls !== undefined) changes.image_urls = dto.imageUrls;

    await this.posts().updateOne(
      { _id: post._id, author_user_id: userId, deleted_at: null },
      { $set: changes },
    );
  }

  async deletePost(userId: string, postId: string): Promise<void> {
    const post = await this.requireOwnedPost(userId, postId);
    this.assertPostEditable(post);

    await this.posts().updateOne(
      { _id: post._id, author_user_id: userId, deleted_at: null },
      {
        $set: {
          deleted_at: new Date(),
          deleted_by: userId,
          updated_at: new Date(),
        },
      },
    );
  }

  async listComments(
    postId: string,
    query: ListForumCommentsQueryDto,
  ): Promise<PaginatedForumComments> {
    const post = await this.requirePost(postId);
    if (post.deleted_at) {
      throw new AppException(
        404,
        'RESOURCE_NOT_FOUND',
        'Post forum tidak ditemukan.',
      );
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter: Filter<IForumComment> = { post_id: postId };
    const [comments, total] = await Promise.all([
      this.comments()
        .find(filter)
        .sort({ created_at: 1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      this.comments().countDocuments(filter),
    ]);

    return {
      comments: await this.serializeComments(comments),
      total,
    };
  }

  async createComment(
    userId: string,
    postId: string,
    dto: CreateForumCommentDto,
  ): Promise<void> {
    const post = await this.requirePost(postId);
    if (post.deleted_at) {
      throw new AppException(
        404,
        'RESOURCE_NOT_FOUND',
        'Post forum tidak ditemukan.',
      );
    }

    if (dto.parentCommentId) {
      await this.assertValidParentComment(postId, dto.parentCommentId);
    }

    const now = new Date();
    await this.comments().insertOne({
      _id: new ObjectId(),
      post_id: postId,
      parent_comment_id: dto.parentCommentId ?? null,
      author_user_id: userId,
      content: dto.content,
      deleted_at: null,
      deleted_by: null,
      created_at: now,
      updated_at: now,
    });
    await this.posts().updateOne(
      { _id: post._id, deleted_at: null },
      { $inc: { comment_count: 1 }, $set: { updated_at: now } },
    );
  }

  async updateComment(
    userId: string,
    commentId: string,
    dto: UpdateForumCommentDto,
  ): Promise<void> {
    const comment = await this.requireOwnedComment(userId, commentId);
    this.assertCommentEditable(comment);

    await this.comments().updateOne(
      { _id: comment._id, author_user_id: userId, deleted_at: null },
      {
        $set: {
          content: dto.content,
          updated_at: new Date(),
        },
      },
    );
  }

  async deleteComment(userId: string, commentId: string): Promise<void> {
    const comment = await this.requireOwnedComment(userId, commentId);
    this.assertCommentEditable(comment);

    const now = new Date();
    await this.comments().updateOne(
      { _id: comment._id, author_user_id: userId, deleted_at: null },
      {
        $set: {
          deleted_at: now,
          deleted_by: userId,
          updated_at: now,
        },
      },
    );
    await this.posts().updateOne(
      { _id: new ObjectId(comment.post_id), comment_count: { $gt: 0 } },
      { $inc: { comment_count: -1 }, $set: { updated_at: now } },
    );
  }

  async likePost(userId: string, postId: string): Promise<void> {
    const post = await this.requirePost(postId);
    if (post.deleted_at) {
      throw new AppException(
        404,
        'RESOURCE_NOT_FOUND',
        'Post forum tidak ditemukan.',
      );
    }

    try {
      await this.likes().insertOne({
        _id: new ObjectId(),
        post_id: postId,
        user_id: userId,
        created_at: new Date(),
      });
    } catch (error) {
      if (this.isDuplicateKey(error)) return;
      throw error;
    }

    await this.posts().updateOne(
      { _id: post._id, deleted_at: null },
      { $inc: { like_count: 1 }, $set: { updated_at: new Date() } },
    );
  }

  async unlikePost(userId: string, postId: string): Promise<void> {
    await this.requirePost(postId);
    const result = await this.likes().deleteOne({
      post_id: postId,
      user_id: userId,
    });
    if (result.deletedCount === 0) return;

    await this.posts().updateOne({ _id: new ObjectId(postId) }, [
      {
        $set: {
          like_count: {
            $max: [0, { $subtract: ['$like_count', 1] }],
          },
          updated_at: new Date(),
        },
      },
    ]);
  }

  private async requirePost(postId: string): Promise<WithId<IForumPost>> {
    if (!ObjectId.isValid(postId)) {
      throw new AppException(400, 'INVALID_ID', 'ID post forum tidak valid.');
    }

    const post = await this.posts().findOne({ _id: new ObjectId(postId) });
    if (!post) {
      throw new AppException(
        404,
        'RESOURCE_NOT_FOUND',
        'Post forum tidak ditemukan.',
      );
    }
    return post;
  }

  private async requireOwnedPost(
    userId: string,
    postId: string,
  ): Promise<WithId<IForumPost>> {
    const post = await this.requirePost(postId);
    if (post.author_user_id !== userId) {
      throw new AppException(
        403,
        'FORBIDDEN',
        'Anda tidak memiliki akses ke post forum ini.',
      );
    }
    return post;
  }

  private assertPostEditable(post: IForumPost): void {
    if (post.deleted_at) {
      throw new AppException(
        409,
        'FORUM_POST_DELETED',
        'Post forum sudah dihapus.',
      );
    }
  }

  private async requireOwnedComment(
    userId: string,
    commentId: string,
  ): Promise<WithId<IForumComment>> {
    if (!ObjectId.isValid(commentId)) {
      throw new AppException(
        400,
        'INVALID_ID',
        'ID komentar forum tidak valid.',
      );
    }

    const comment = await this.comments().findOne({
      _id: new ObjectId(commentId),
    });
    if (!comment) {
      throw new AppException(
        404,
        'RESOURCE_NOT_FOUND',
        'Komentar forum tidak ditemukan.',
      );
    }
    if (comment.author_user_id !== userId) {
      throw new AppException(
        403,
        'FORBIDDEN',
        'Anda tidak memiliki akses ke komentar forum ini.',
      );
    }
    return comment;
  }

  private assertCommentEditable(comment: IForumComment): void {
    if (comment.deleted_at) {
      throw new AppException(
        409,
        'FORUM_COMMENT_DELETED',
        'Komentar forum sudah dihapus.',
      );
    }
  }

  private async assertValidParentComment(
    postId: string,
    parentCommentId: string,
  ): Promise<void> {
    const parent = await this.comments().findOne({
      _id: new ObjectId(parentCommentId),
    });
    if (!parent || parent.deleted_at) {
      throw new AppException(
        404,
        'RESOURCE_NOT_FOUND',
        'Parent komentar tidak ditemukan.',
      );
    }
    if (parent.post_id !== postId) {
      throw new AppException(
        400,
        'BUSINESS_RULE_VIOLATION',
        'Parent komentar harus berasal dari post yang sama.',
      );
    }
  }

  private postSort(sort: 'latest' | 'hot'): Sort {
    if (sort === 'hot') {
      return {
        like_count: -1,
        comment_count: -1,
        created_at: -1,
        _id: -1,
      };
    }
    return { created_at: -1, _id: -1 };
  }

  private async serializePosts(
    posts: WithId<IForumPost>[],
    userId: string,
  ): Promise<ForumPostResponseDto[]> {
    const [authors, liked] = await Promise.all([
      this.authorMap(posts.map((post) => post.author_user_id)),
      this.likedPostIds(
        userId,
        posts.map((post) => post._id.toHexString()),
      ),
    ]);

    return posts.map((post) =>
      ForumSerializer.toPostResponse(
        post,
        ForumSerializer.toAuthor(authors.get(post.author_user_id)),
        liked.has(post._id.toHexString()),
      ),
    );
  }

  private async serializeComments(
    comments: WithId<IForumComment>[],
  ): Promise<ForumCommentResponseDto[]> {
    const authors = await this.authorMap(
      comments.map((comment) => comment.author_user_id),
    );
    return comments.map((comment) =>
      ForumSerializer.toCommentResponse(
        comment,
        ForumSerializer.toAuthor(authors.get(comment.author_user_id)),
      ),
    );
  }

  private async authorMap(userIds: string[]): Promise<Map<string, IUser>> {
    const uniqueIds = [...new Set(userIds)].filter((id) =>
      ObjectId.isValid(id),
    );
    if (uniqueIds.length === 0) return new Map();

    const users = await this.users()
      .find({ _id: { $in: uniqueIds.map((id) => new ObjectId(id)) } })
      .project<IUser>({
        username: 1,
        full_name: 1,
        avatar_url: 1,
        role: 1,
      })
      .toArray();

    return new Map(users.map((user) => [user._id.toHexString(), user]));
  }

  private async likedPostIds(
    userId: string,
    postIds: string[],
  ): Promise<Set<string>> {
    if (postIds.length === 0) return new Set();
    const likes = await this.likes()
      .find({
        user_id: userId,
        post_id: { $in: postIds },
      })
      .project<Pick<IForumLike, 'post_id'>>({ post_id: 1 })
      .toArray();
    return new Set(likes.map((like) => like.post_id));
  }

  private isDuplicateKey(error: unknown): boolean {
    return error instanceof MongoServerError && error.code === 11000;
  }

  private posts(): Collection<IForumPost> {
    return this.postModel
      .query()
      .getMongoDBCollection() as unknown as Collection<IForumPost>;
  }

  private comments(): Collection<IForumComment> {
    return this.commentModel
      .query()
      .getMongoDBCollection() as unknown as Collection<IForumComment>;
  }

  private likes(): Collection<IForumLike> {
    return this.likeModel
      .query()
      .getMongoDBCollection() as unknown as Collection<IForumLike>;
  }

  private users(): Collection<IUser> {
    return Database.getDb(
      this.configService.getOrThrow<string>('MONGODB_CONNECTION'),
      this.configService.getOrThrow<string>('MONGODB_DATABASE'),
    ).collection<IUser>('users');
  }
}
