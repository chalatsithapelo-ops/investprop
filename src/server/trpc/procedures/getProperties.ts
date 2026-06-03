import { z } from "zod";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";

export const getProperties = baseProcedure
  .input(
    z.object({
      type: z.enum(["all", "flip", "rental", "development"]).optional(),
      cursor: z.number().optional(),
      limit: z.number().min(1).max(100).default(12),
      // Search and filter parameters
      searchQuery: z.string().optional(),
      minPrice: z.number().optional(),
      maxPrice: z.number().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      minROI: z.number().optional(),
      maxROI: z.number().optional(),
      investmentStatus: z.enum(["PLANNING", "RAISING_FUNDS", "FUNDED", "PROJECT_STARTED", "COMPLETED"]).optional(),
      sortBy: z.enum(["price_asc", "price_desc", "createdAt_desc", "createdAt_asc", "roi_desc", "roi_asc"]).optional(),
    })
  )
  .query(async ({ input }) => {
    const limit = input.limit;
    const cursor = input.cursor;

    // Build where clause
    const where: any = {};

    // Type filter
    if (input.type === "flip") {
      where.propertyFlip = { isNot: null };
    } else if (input.type === "rental") {
      where.rentalBond = { isNot: null };
    } else if (input.type === "development") {
      where.propertyDevelopment = { isNot: null };
    }

    // Search query - search across multiple fields
    if (input.searchQuery) {
      where.OR = [
        { title: { contains: input.searchQuery, mode: "insensitive" } },
        { description: { contains: input.searchQuery, mode: "insensitive" } },
        { address: { contains: input.searchQuery, mode: "insensitive" } },
        { city: { contains: input.searchQuery, mode: "insensitive" } },
      ];
    }

    // Price range filter
    if (input.minPrice !== undefined) {
      where.price = { ...where.price, gte: input.minPrice };
    }
    if (input.maxPrice !== undefined) {
      where.price = { ...where.price, lte: input.maxPrice };
    }

    // Location filters
    if (input.city) {
      where.city = { contains: input.city, mode: "insensitive" };
    }
    if (input.state) {
      where.state = { contains: input.state, mode: "insensitive" };
    }

    // Investment status filter
    if (input.investmentStatus) {
      where.investmentStatus = input.investmentStatus;
    }

    // ROI filter - more complex as it's in related tables
    // We'll fetch all properties first and filter in memory for ROI
    // (Prisma doesn't support filtering on related table fields in where clause easily)

    // Build orderBy clause
    let orderBy: any = { createdAt: "desc" }; // Default sorting
    if (input.sortBy === "price_asc") {
      orderBy = { price: "asc" };
    } else if (input.sortBy === "price_desc") {
      orderBy = { price: "desc" };
    } else if (input.sortBy === "createdAt_asc") {
      orderBy = { createdAt: "asc" };
    } else if (input.sortBy === "createdAt_desc") {
      orderBy = { createdAt: "desc" };
    }
    // Note: ROI sorting will be done in memory after fetching

    const properties = await db.property.findMany({
      take: limit + 1,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy,
      where,
      include: {
        user: {
          select: {
            name: true,
            role: true,
          },
        },
        propertyFlip: input.type === "flip" || input.type === "all" || !input.type,
        rentalBond: input.type === "rental" || input.type === "all" || !input.type,
        propertyDevelopment: input.type === "development" || input.type === "all" || !input.type,
      },
    });

    // Filter by ROI if specified (in-memory filtering)
    let filteredProperties = properties;
    if (input.minROI !== undefined || input.maxROI !== undefined) {
      filteredProperties = properties.filter((property) => {
        let roi: number | undefined;
        
        if (property.propertyFlip) {
          roi = property.propertyFlip.expectedROI;
        } else if (property.rentalBond) {
          roi = property.rentalBond.capRate; // Using cap rate as ROI proxy for rentals
        } else if (property.propertyDevelopment) {
          roi = property.propertyDevelopment.expectedROI;
        }

        if (roi === undefined) return false;

        if (input.minROI !== undefined && roi < input.minROI) return false;
        if (input.maxROI !== undefined && roi > input.maxROI) return false;

        return true;
      });
    }

    // Sort by ROI if specified (in-memory sorting)
    if (input.sortBy === "roi_desc" || input.sortBy === "roi_asc") {
      filteredProperties.sort((a, b) => {
        const roiA = a.propertyFlip?.expectedROI || a.rentalBond?.capRate || a.propertyDevelopment?.expectedROI || 0;
        const roiB = b.propertyFlip?.expectedROI || b.rentalBond?.capRate || b.propertyDevelopment?.expectedROI || 0;
        
        return input.sortBy === "roi_desc" ? roiB - roiA : roiA - roiB;
      });
    }

    let nextCursor: number | undefined = undefined;
    if (filteredProperties.length > limit) {
      const nextItem = filteredProperties.pop();
      nextCursor = nextItem!.id;
    }

    return {
      properties: filteredProperties,
      nextCursor,
    };
  });
