import { db } from "~/server/db";
import bcryptjs from "bcryptjs";
import { minioClient } from "~/server/minio";

async function setupMinioBuckets() {
  const bucketName = "property-images";

  // Check if bucket exists
  const bucketExists = await minioClient.bucketExists(bucketName);

  if (!bucketExists) {
    console.log(`Creating MinIO bucket: ${bucketName}`);
    await minioClient.makeBucket(bucketName, "us-east-1");

    // Set public read policy for the bucket
    const policy = {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { AWS: ["*"] },
          Action: ["s3:GetObject"],
          Resource: [`arn:aws:s3:::${bucketName}/*`],
        },
      ],
    };

    await minioClient.setBucketPolicy(bucketName, JSON.stringify(policy));
    console.log(`MinIO bucket ${bucketName} created with public read policy`);
  } else {
    console.log(`MinIO bucket ${bucketName} already exists`);
  }
}

async function setup() {
  // Ensure all demo users exist (create them if they don't)
  console.log("Checking demo users...");
  const hashedPassword = await bcryptjs.hash("password123", 10);

  // Check and create investor
  let investor = await db.user.findUnique({
    where: { email: "investor@demo.com" },
  });
  if (!investor) {
    console.log("Creating investor@demo.com");
    investor = await db.user.create({
      data: {
        email: "investor@demo.com",
        password: hashedPassword,
        name: "John Investor",
        role: "INVESTOR",
        updatedAt: new Date(),
      },
    });
  } else {
    await db.user.update({ where: { id: investor.id }, data: { name: "John Investor", password: hashedPassword } });
  }

  // Check and create investor 2
  let investor2 = await db.user.findUnique({
    where: { email: "investor2@demo.com" },
  });
  if (!investor2) {
    console.log("Creating investor2@demo.com");
    investor2 = await db.user.create({
      data: {
        email: "investor2@demo.com",
        password: hashedPassword,
        name: "Naledi Mokoena",
        role: "INVESTOR",
        updatedAt: new Date(),
      },
    });
  } else {
    await db.user.update({ where: { id: investor2.id }, data: { name: "Naledi Mokoena", password: hashedPassword } });
  }

  // Check and create investor 3
  let investor3 = await db.user.findUnique({
    where: { email: "investor3@demo.com" },
  });
  if (!investor3) {
    console.log("Creating investor3@demo.com");
    investor3 = await db.user.create({
      data: {
        email: "investor3@demo.com",
        password: hashedPassword,
        name: "Thabo Ndlovu",
        role: "INVESTOR",
        updatedAt: new Date(),
      },
    });
  } else {
    await db.user.update({ where: { id: investor3.id }, data: { name: "Thabo Ndlovu", password: hashedPassword } });
  }

  // Check and create development manager
  let devManager = await db.user.findUnique({
    where: { email: "devmanager@demo.com" },
  });
  if (!devManager) {
    console.log("Creating devmanager@demo.com");
    devManager = await db.user.create({
      data: {
        email: "devmanager@demo.com",
        password: hashedPassword,
        name: "Sarah Development",
        role: "DEVELOPMENT_MANAGER",
        updatedAt: new Date(),
      },
    });
  }

  // Check and create project manager
  let projectManager = await db.user.findUnique({
    where: { email: "pm@demo.com" },
  });
  if (!projectManager) {
    console.log("Creating pm@demo.com");
    projectManager = await db.user.create({
      data: {
        email: "pm@demo.com",
        password: hashedPassword,
        name: "Mike Projects",
        role: "PROJECT_MANAGER",
        updatedAt: new Date(),
      },
    });
  }

  // Check and create property owner
  let owner = await db.user.findUnique({
    where: { email: "owner@demo.com" },
  });
  if (!owner) {
    console.log("Creating owner@demo.com");
    owner = await db.user.create({
      data: {
        email: "owner@demo.com",
        password: hashedPassword,
        name: "Lisa Property",
        role: "PROPERTY_OWNER",
        updatedAt: new Date(),
      },
    });
  }

  // Check and create contractor
  let contractor = await db.user.findUnique({
    where: { email: "contractor@demo.com" },
  });
  if (!contractor) {
    console.log("Creating contractor@demo.com");
    contractor = await db.user.create({
      data: {
        email: "contractor@demo.com",
        password: hashedPassword,
        name: "Carlos Contractor",
        role: "CONTRACTOR",
        updatedAt: new Date(),
      },
    });
  }

  // Check if we need to seed properties
  const propertyCount = await db.property.count();
  if (propertyCount > 0) {
    console.log("Properties already exist, skipping property seeding");
    console.log("Demo users verified/created successfully!");
    console.log("Demo accounts:");
    console.log("- investor@demo.com / password123");
    console.log("- investor2@demo.com / password123");
    console.log("- investor3@demo.com / password123");
    console.log("- devmanager@demo.com / password123");
    console.log("- pm@demo.com / password123");
    console.log("- owner@demo.com / password123");
    console.log("- contractor@demo.com / password123");
    return;
  }

  // Setup MinIO buckets (best-effort). Failing to reach/auth MinIO should not block DB seeding.
  try {
    await setupMinioBuckets();
  } catch (error) {
    console.warn("MinIO setup failed; continuing with database seeding.");
    console.warn(error);
  }

  console.log("Seeding properties...");

  // Create sample properties - Property Flips
  const flip1 = await db.property.create({
    data: {
      title: "Modern Downtown Loft",
      description: "Stunning loft in the heart of downtown with high ceilings and exposed brick. Perfect flip opportunity with minimal renovation needed.",
      address: "123 Main Street",
      city: "San Francisco",
      state: "CA",
      zipCode: "94102",
      price: 850000,
      imageUrl: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800",
      status: "IN_PROGRESS",
      bedrooms: 2,
      bathrooms: 2,
      squareMeters: 1500,
      userId: investor.id,
    },
  });

  await db.propertyFlip.create({
    data: {
      propertyId: flip1.id,
      flipType: "RESALE",
      purchasePrice: 750000,
      renovationBudget: 100000,
      estimatedValue: 950000,
      userId: investor.id,
    },
  });

  const flip2 = await db.property.create({
    data: {
      title: "Suburban Family Home",
      description: "Spacious 4-bedroom home in excellent school district. Great rental flip potential.",
      address: "456 Oak Avenue",
      city: "Austin",
      state: "TX",
      zipCode: "78701",
      price: 425000,
      imageUrl: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800",
      status: "AVAILABLE",
      bedrooms: 4,
      bathrooms: 3,
      squareMeters: 2400,
      userId: investor.id,
    },
  });

  await db.propertyFlip.create({
    data: {
      propertyId: flip2.id,
      flipType: "RENTAL",
      purchasePrice: 400000,
      renovationBudget: 25000,
      estimatedValue: 475000,
      userId: investor.id,
    },
  });

  const flip3 = await db.property.create({
    data: {
      title: "Beachfront Condo",
      description: "Luxury beachfront condo with panoramic ocean views. High-end finishes throughout.",
      address: "789 Beach Road",
      city: "Miami",
      state: "FL",
      zipCode: "33139",
      price: 1200000,
      imageUrl: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800",
      status: "COMPLETED",
      bedrooms: 3,
      bathrooms: 2,
      squareMeters: 1800,
      userId: owner.id,
    },
  });

  await db.propertyFlip.create({
    data: {
      propertyId: flip3.id,
      flipType: "RESALE",
      purchasePrice: 950000,
      renovationBudget: 150000,
      estimatedValue: 1350000,
      actualValue: 1325000,
      profit: 225000,
      completionDate: new Date("2024-01-15"),
      userId: owner.id,
    },
  });

  // Create sample rental properties
  const rental1 = await db.property.create({
    data: {
      title: "Downtown Studio Apartment",
      description: "Cozy studio in prime location. Walking distance to public transport and amenities.",
      address: "321 City Center",
      city: "New York",
      state: "NY",
      zipCode: "10001",
      price: 450000,
      imageUrl: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800",
      status: "RENTED",
      bedrooms: 1,
      bathrooms: 1,
      squareMeters: 600,
      userId: owner.id,
    },
  });

  await db.rentalBond.create({
    data: {
      propertyId: rental1.id,
      bondAmount: 4000,
      monthlyRent: 2800,
      leaseStartDate: new Date("2024-01-01"),
      leaseEndDate: new Date("2024-12-31"),
      tenantName: "Emma Thompson",
      tenantEmail: "emma@email.com",
      userId: owner.id,
    },
  });

  const rental2 = await db.property.create({
    data: {
      title: "Garden View Apartment",
      description: "Beautiful 2-bedroom apartment with private garden access. Pet-friendly.",
      address: "654 Garden Lane",
      city: "Portland",
      state: "OR",
      zipCode: "97201",
      price: 380000,
      imageUrl: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800",
      status: "AVAILABLE",
      bedrooms: 2,
      bathrooms: 1,
      squareMeters: 950,
      userId: investor.id,
    },
  });

  await db.rentalBond.create({
    data: {
      propertyId: rental2.id,
      bondAmount: 3600,
      monthlyRent: 2400,
      leaseStartDate: new Date("2024-03-01"),
      leaseEndDate: new Date("2025-02-28"),
      userId: investor.id,
    },
  });

  // Create sample development projects
  const dev1 = await db.property.create({
    data: {
      title: "Riverside Luxury Condos",
      description: "Premium mixed-use development with 50 residential units and ground-floor retail.",
      address: "100 Riverside Drive",
      city: "Seattle",
      state: "WA",
      zipCode: "98101",
      price: 15000000,
      imageUrl: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800",
      status: "IN_PROGRESS",
      userId: devManager.id,
    },
  });

  await db.propertyDevelopment.create({
    data: {
      propertyId: dev1.id,
      projectName: "Riverside Luxury Condos Phase 1",
      totalBudget: 15000000,
      spentBudget: 8500000,
      startDate: new Date("2023-06-01"),
      estimatedEndDate: new Date("2025-06-01"),
      numberOfUnits: 50,
      userId: devManager.id,
    },
  });

  const dev2 = await db.property.create({
    data: {
      title: "Green Valley Townhomes",
      description: "Sustainable townhome community with solar panels and EV charging stations.",
      address: "200 Valley Road",
      city: "Denver",
      state: "CO",
      zipCode: "80202",
      price: 8500000,
      imageUrl: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800",
      status: "IN_PROGRESS",
      userId: projectManager.id,
    },
  });

  await db.propertyDevelopment.create({
    data: {
      propertyId: dev2.id,
      projectName: "Green Valley Townhomes",
      totalBudget: 8500000,
      spentBudget: 3200000,
      startDate: new Date("2024-01-01"),
      estimatedEndDate: new Date("2025-12-31"),
      numberOfUnits: 24,
      userId: projectManager.id,
    },
  });

  const dev3 = await db.property.create({
    data: {
      title: "Tech Campus Office Park",
      description: "Modern office complex with collaborative workspaces and amenities.",
      address: "300 Innovation Way",
      city: "San Jose",
      state: "CA",
      zipCode: "95110",
      price: 25000000,
      imageUrl: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800",
      status: "AVAILABLE",
      userId: devManager.id,
    },
  });

  await db.propertyDevelopment.create({
    data: {
      propertyId: dev3.id,
      projectName: "Tech Campus Phase 1",
      totalBudget: 25000000,
      spentBudget: 0,
      startDate: new Date("2024-06-01"),
      estimatedEndDate: new Date("2026-12-31"),
      numberOfUnits: 10,
      userId: devManager.id,
    },
  });

  console.log("Database seeded successfully!");
  console.log("Demo users:");
  console.log("- investor@demo.com / password123");
  console.log("- investor2@demo.com / password123");
  console.log("- investor3@demo.com / password123");
  console.log("- devmanager@demo.com / password123");
  console.log("- pm@demo.com / password123");
  console.log("- owner@demo.com / password123");
  console.log("- contractor@demo.com / password123");
}

setup()
  .then(() => {
    console.log("setup.ts complete");
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
