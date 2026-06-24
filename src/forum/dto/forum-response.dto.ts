import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../../common/enums/user-role.enum';

export class ForumAuthorResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() username!: string;
  @ApiPropertyOptional() fullName!: string | null;
  @ApiPropertyOptional() avatarUrl!: string | null;
  @ApiProperty({ enum: UserRole }) role!: UserRole;
}

export class ForumPostResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: ForumAuthorResponseDto })
  author!: ForumAuthorResponseDto;
  @ApiPropertyOptional() title!: string | null;
  @ApiPropertyOptional() content!: string | null;
  @ApiProperty({ type: [String] }) imageUrls!: string[];
  @ApiProperty() likeCount!: number;
  @ApiProperty() commentCount!: number;
  @ApiProperty() isLiked!: boolean;
  @ApiProperty() isDeleted!: boolean;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
  @ApiPropertyOptional() deletedAt!: string | null;
}

export class ForumCommentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() postId!: string;
  @ApiPropertyOptional() parentCommentId!: string | null;
  @ApiProperty({ type: ForumAuthorResponseDto })
  author!: ForumAuthorResponseDto;
  @ApiPropertyOptional() content!: string | null;
  @ApiProperty() isDeleted!: boolean;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
  @ApiPropertyOptional() deletedAt!: string | null;
}

export class ForumPaginationMetaDto {
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() totalItems!: number;
  @ApiProperty() totalPages!: number;
  @ApiProperty() hasNextPage!: boolean;
  @ApiProperty() hasPreviousPage!: boolean;
}

export class PaginatedForumPostResponseDto {
  @ApiProperty({ type: [ForumPostResponseDto] })
  data!: ForumPostResponseDto[];

  @ApiProperty({ type: ForumPaginationMetaDto })
  meta!: ForumPaginationMetaDto;
}

export class ForumPostDataResponseDto {
  @ApiProperty({ type: ForumPostResponseDto })
  data!: ForumPostResponseDto;
}

export class PaginatedForumCommentResponseDto {
  @ApiProperty({ type: [ForumCommentResponseDto] })
  data!: ForumCommentResponseDto[];

  @ApiProperty({ type: ForumPaginationMetaDto })
  meta!: ForumPaginationMetaDto;
}
